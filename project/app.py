from flask import Flask, request, jsonify, render_template, send_file
import pandas as pd
import numpy as np
import json
import os
from werkzeug.utils import secure_filename
import tempfile

# Import core analysis logic from your existing code
class DEGAnalyzer:
    """Handles the logic for differential expressed gene analysis"""
    
    @staticmethod
    def load_deg_data(file_path):
        """Load DEG data from CSV file"""
        if not file_path or not os.path.exists(file_path):
            return pd.DataFrame()
        try:
            return pd.read_csv(file_path)
        except Exception as e:
            print(f"Error loading DEG data: {e}")
            return pd.DataFrame()
    
    @staticmethod
    def count_significant_genes(df, logfc_thresh=1.0, p_adj_thresh=0.05):
        """Count genes with |log2FoldChange| > logfc_thresh and adjusted p-value < p_adj_thresh"""
        if df.empty:
            return 0
        sig = df[(df['padj'] < p_adj_thresh) & (df['log2FoldChange'].abs() > logfc_thresh)]
        return sig.shape[0]
    
    @staticmethod
    def get_significant_genes(df, logfc_thresh=1.0, p_adj_thresh=0.05):
        """Get genes with |log2FoldChange| > logfc_thresh and adjusted p-value < p_adj_thresh"""
        if df.empty:
            return pd.DataFrame()
        return df[(df['padj'] < p_adj_thresh) & (df['log2FoldChange'].abs() > logfc_thresh)]
    
    @staticmethod
    def classify_liver_state(count_nafld, count_nash):
        """
        Automatically decide liver condition based on number of significant DEGs:
        - If no DEGs in both contrasts: Healthy
        - If H vs NAFLD has more significant DEGs than H vs NASH: NAFLD
        - Otherwise: NASH
        """
        if count_nafld == 0 and count_nash == 0:
            return 'Sano'
        return 'NAFLD' if count_nafld > count_nash else 'NASH'
    
    @staticmethod
    def get_volcano_plot_data(df):
        """Prepare data for volcano plot"""
        if df.empty:
            return None, None, None
        x = df['log2FoldChange'].values
        y = -np.log10(df['padj'].values)
        # Replace infinities with large number for visualization
        y[np.isinf(y)] = 50  
        # Determine significance for coloring
        is_significant = (df['padj'] < 0.05) & (df['log2FoldChange'].abs() > 1)
        return x.tolist(), y.tolist(), is_significant.tolist()


# Initialize Flask app
app = Flask(__name__)
app.config['UPLOAD_FOLDER'] = tempfile.gettempdir()
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max upload

# Create analyzer instance
analyzer = DEGAnalyzer()

def clean_json(data):
    """Recursively convert NaN, inf, -inf to None for JSON serialization."""
    if isinstance(data, dict):
        return {k: clean_json(v) for k, v in data.items()}
    elif isinstance(data, list):
        return [clean_json(v) for v in data]
    elif isinstance(data, float):
        if np.isnan(data) or np.isinf(data):
            return None
        return data
    return data

@app.route('/')
def index():
    """Render the main application page"""
    return render_template('index.html')

@app.route('/api/upload', methods=['POST'])
def upload_file():
    """Handle file uploads"""
    if 'file' not in request.files:
        return jsonify({'error': 'No se encontró el archivo en la solicitud'}), 400
    
    file = request.files['file']
    file_type = request.form.get('fileType', '')
    
    if file.filename == '':
        return jsonify({'error': 'No se seleccionó ningún archivo'}), 400
    
    if file and file.filename.endswith('.csv'):
        filename = secure_filename(file.filename)
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.save(filepath)
        
        # Process the file based on type
        df = analyzer.load_deg_data(filepath)
        
        if df.empty:
            return jsonify({'error': 'No se pudieron cargar los datos del archivo'}), 400
        
        # Return a sample of the data for preview
        preview = df.head(5).to_dict(orient='records')
        
        return jsonify({
            'success': True,
            'fileType': file_type,
            'filename': filename,
            'filepath': filepath,
            'preview': preview,
            'columns': df.columns.tolist()
        })
    
    return jsonify({'error': 'Tipo de archivo no válido'}), 400

@app.route('/api/analyze', methods=['POST'])
def analyze_data():
    """Analyze DEG data and return results"""
    data = request.json
    
    # Get parameters
    logfc_thresh = float(data.get('logfc_thresh', 1.0))
    p_adj_thresh = float(data.get('p_adj_thresh', 0.05))
    
    # Get file paths
    h_nafld_path = data.get('h_nafld_path', '')
    h_nash_path = data.get('h_nash_path', '')
    nafld_nash_path = data.get('nafld_nash_path', '')
    
    # Load data
    h_nafld_df = analyzer.load_deg_data(h_nafld_path)
    h_nash_df = analyzer.load_deg_data(h_nash_path)
    nafld_nash_df = analyzer.load_deg_data(nafld_nash_path)
    
    # Count significant genes
    count_nafld = analyzer.count_significant_genes(h_nafld_df, logfc_thresh, p_adj_thresh)
    count_nash = analyzer.count_significant_genes(h_nash_df, logfc_thresh, p_adj_thresh)
    count_nafld_nash = analyzer.count_significant_genes(nafld_nash_df, logfc_thresh, p_adj_thresh)
    
    # Determine liver state (auto or manual)
    manual_state = data.get('manual_state', 'Auto')
    if manual_state != 'Auto':
        liver_state = manual_state
    else:
        liver_state = analyzer.classify_liver_state(count_nafld, count_nash)
    
    # Get volcano plot data
    h_nafld_volcano = analyzer.get_volcano_plot_data(h_nafld_df) if not h_nafld_df.empty else [[], [], []]
    h_nash_volcano = analyzer.get_volcano_plot_data(h_nash_df) if not h_nash_df.empty else [[], [], []]
    nafld_nash_volcano = analyzer.get_volcano_plot_data(nafld_nash_df) if not nafld_nash_df.empty else [[], [], []]
    
    # Return analysis results
    result = {
        'counts': {
            'h_nafld': count_nafld,
            'h_nash': count_nash,
            'nafld_nash': count_nafld_nash
        },
        'liver_state': liver_state,
        'volcano_data': {
            'h_nafld': {
                'x': h_nafld_volcano[0],
                'y': h_nafld_volcano[1],
                'is_significant': h_nafld_volcano[2]
            },
            'h_nash': {
                'x': h_nash_volcano[0],
                'y': h_nash_volcano[1],
                'is_significant': h_nash_volcano[2]
            },
            'nafld_nash': {
                'x': nafld_nash_volcano[0],
                'y': nafld_nash_volcano[1],
                'is_significant': nafld_nash_volcano[2]
            }
        }
    }
    return jsonify(clean_json(result))

@app.route('/api/liver-model', methods=['POST'])
def generate_liver_model():
    """Generate liver 3D model data for visualization"""
    data = request.json
    liver_state = data.get('liver_state', 'Sano')
    
    # Here you would generate the 3D model data
    # This is a simplified placeholder returning basic model properties
    # In a real implementation, you might use a library to generate
    # a more sophisticated 3D model to be rendered by Three.js
    
    liver_features = {
        'Sano': {
            'base_color': 'darkred',
            'surface_color': 'indianred',
            'spots': {
                'count': 0,
                'size_range': [0, 0],
                'color': 'white',
                'opacity': 0
            },
            'texture': 'smooth',
            'vessels_color': 'blue',
            'vessels_prominence': 0.8
        },
        'NAFLD': {
            'base_color': 'darkkhaki',
            'surface_color': 'khaki',
            'spots': {
                'count': 20,
                'size_range': [2, 6],
                'color': 'yellow',
                'opacity': 0.6
            },
            'texture': 'fatty',
            'vessels_color': 'blue',
            'vessels_prominence': 0.6
        },
        'NASH': {
            'base_color': 'tan',
            'surface_color': 'burlywood',
            'spots': {
                'count': 35,
                'size_range': [3, 8],
                'color': 'white',
                'opacity': 0.7
            },
            'texture': 'nodular',
            'vessels_color': 'blue',
            'vessels_prominence': 0.4
        }
    }
    
    return jsonify({
        'liver_state': liver_state,
        'features': liver_features.get(liver_state, liver_features['Sano']),
        'model_params': {
            'size': 200,
            'position': [0, 0, 0],
            'rotation': [0, 0, 0]
        }
    })


# # kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk
# Okay, me queda tiempo, pero ¿cuánto?
# Ya no estoy solo componiendo estas canciones en mi cuarto
# Esto es real, esto es trabajo
# Lo que me da de almorzar, con lo que voy a jubilar a mis papás
# Sigan dudando
# Día con día nada cambia
# Pero nada es igual si miro atrás (why?)
# Y sigo aquí, escribiéndote estas cosas que jamás vas a escuchar
# O yo qué sé
# Quizás tú me pienses también cuando estás sola en tu hotel
# Quizá me escuches en la radio y preguntes "¿quién es él?"
# Por puro orgullo
# Porque sabes que yo sigo siendo tuyo
# Uh
# A-T-P, A-T-P, A-T-P, A-T-P
# Uh
# A-T-P, A-T-P, A-T-P, A-T-P, A-T-P
# Estos caminos de la vida nos alejan y alargan
# Ojalá consigas todo lo que todo lo que tú me platicabas
# Ojalá te traten lindo en donde sea que trabajas
# Ojalá te trate lindo el que te espera en tu casa
# Eso lo siento, je
# Mi corazón recita estas palabras en silencio
# Como el viento, uh
# Y sueño que te rocen la mejilla y sepas
# Aún te pienso

@app.route('/documentacion')
def documentation():
    return render_template('documentation.html')

@app.route('/tutorial')
def tutorial():
    return render_template('tutorial.html')

# @app.route('/contact', methods=['GET', 'POST'])
# def contact():
#     if request.method == 'POST':
#         # Obtener los datos del formulario
#         name = request.form.get('name')
#         email = request.form.get('email')
#         subject = request.form.get('subject')
#         message = request.form.get('message')
        
#         # Aquí puedes agregar la lógica para manejar el envío del formulario
#         # Por ejemplo, enviar un correo electrónico o guardar en una base de datos
        
#         # Redirigir con un mensaje de éxito
#         flash('¡Mensaje enviado con éxito!', 'success')
#         return redirect(url_for('contact'))
        
#     return render_template('contact.html')

if __name__ == '__main__':
    app.run(debug=True)