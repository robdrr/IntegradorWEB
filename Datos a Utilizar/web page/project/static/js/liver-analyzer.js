// Almacenamiento de datos de archivos y estado de visualización 3D
// Objeto para almacenar los datos de los archivos cargados
// Cada propiedad (hNafld, hNash, nafldNash) contiene la ruta y los datos del archivo
let fileData = {
    hNafld: { path: null, data: null },    // Datos para comparación Sano vs NAFLD
    hNash: { path: null, data: null },      // Datos para comparación Sano vs NASH
    nafldNash: { path: null, data: null }   // Datos para comparación NAFLD vs NASH
};

// Variables globales para los componentes de Three.js
let renderer;    // Renderizador para gráficos 3D
let scene;      // Escena donde se colocan los objetos 3D
let camera;     // Cámara que define la perspectiva
let liver;      // Modelo 3D del hígado
let controls;   // Controles para manipular la vista 3D
let isSceneInitialized = false;  // Bandera para controlar la inicialización de la escena

// Referencias a elementos del DOM para interacción con usuario
const analyzeButton = document.getElementById('analyzeButton');  // Botón para iniciar análisis
const logfcThreshold = document.getElementById('logfcThreshold');  // Control deslizante para umbral logFC
const pvalThreshold = document.getElementById('pvalThreshold');    // Control deslizante para umbral p-valor
const logfcValue = document.getElementById('logfcValue');         // Elemento para mostrar valor actual logFC
const pvalValue = document.getElementById('pvalValue');           // Elemento para mostrar valor actual p-valor

// Evento que se ejecuta cuando el DOM está completamente cargado
document.addEventListener('DOMContentLoaded', function() {
    initializeFileUploads();     // Inicializa la funcionalidad de carga de archivos
    initializeSliders();         // Inicializa los controles deslizantes
    initializeAnalyzeButton();   // Inicializa el botón de análisis
    checkAnalyzeButtonState();   // Verifica el estado inicial del botón
    initThreeJsScene();         // Inicializa la escena 3D
});

// Función para inicializar la carga de archivos
function initializeFileUploads() {
    // Itera sobre los tipos de archivos que se pueden cargar
    ['hNafld', 'hNash', 'nafldNash'].forEach(fileType => {
        // Obtiene referencias a los elementos del DOM
        const uploadArea = document.getElementById(`${fileType}Upload`);
        const fileInput = document.getElementById(`${fileType}File`);
        const fileNameSpan = document.getElementById(`${fileType}FileName`);

        // Configura eventos de clic para abrir el selector de archivos
        uploadArea.addEventListener('click', () => fileInput.click());
        
        // Maneja el cambio en la selección de archivo
        fileInput.addEventListener('change', function() {
            if (this.files.length > 0) {
                handleFileUpload(this.files[0], fileType, fileNameSpan);
            }
        });

        // Configura eventos para arrastrar y soltar archivos
        uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadArea.classList.add('active');
        });

        uploadArea.addEventListener('dragleave', () => {
            uploadArea.classList.remove('active');
        });

        uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadArea.classList.remove('active');
            if (e.dataTransfer.files.length > 0) {
                handleFileUpload(e.dataTransfer.files[0], fileType, fileNameSpan);
            }
        });
    });
}

// Función para manejar la carga de archivos
async function handleFileUpload(file, fileType, fileNameSpan) {
    // Verifica que el archivo sea CSV
    if (!file.name.endsWith('.csv')) {
        alert('Por favor, sube un archivo CSV');
        return;
    }

    // Prepara los datos para enviar al servidor
    const formData = new FormData();
    formData.append('file', file);
    formData.append('fileType', fileType);

    try {
        // Envía el archivo al servidor
        const response = await fetch('/api/upload', {
            method: 'POST',
            body: formData
        });

        const data = await response.json();
        if (data.success) {
            // Actualiza el estado local con los datos del archivo
            fileData[fileType] = {
                path: data.filepath,
                data: data.preview
            };
            fileNameSpan.textContent = file.name;
            displayDataPreview(fileType, data.preview, data.columns);
            checkAnalyzeButtonState();
        } else {
            alert(`Error: ${data.error}`);
        }
    } catch (error) {
        console.error('Error al subir el archivo:', error);
        alert('Error al subir el archivo. Por favor, inténtalo de nuevo.');
    }
}

// Inicializar sliders
function initializeSliders() {
    logfcThreshold.addEventListener('input', function() {
        logfcValue.textContent = parseFloat(this.value).toFixed(1);
    });

    pvalThreshold.addEventListener('input', function() {
        pvalValue.textContent = parseFloat(this.value).toFixed(3);
    });
}

// Inicializar botón de análisis
function initializeAnalyzeButton() {
    analyzeButton.addEventListener('click', analyzeData);
}

// Check analyze button state
function checkAnalyzeButtonState() {
    analyzeButton.disabled = !(fileData.hNafld.path || fileData.hNash.path || fileData.nafldNash.path);
}

// Mostrar previsualización de datos
function displayDataPreview(fileType, data, columns) {
    const tableContainer = document.getElementById(`${fileType}Table`);
    tableContainer.style.overflowX = 'auto';
    tableContainer.style.maxWidth = '100%';
    
    let tableHtml = '<table class="table table-striped table-sm"><thead><tr>';
    columns.forEach(column => {
        tableHtml += `<th>${column}</th>`;
    });
    tableHtml += '</tr></thead><tbody>';
    
    data.forEach(row => {
        tableHtml += '<tr>';
        columns.forEach(column => {
            const value = row[column];
            tableHtml += `<td>${typeof value === 'number' ? value.toFixed(4) : value}</td>`;
        });
        tableHtml += '</tr>';
    });
    
    tableHtml += '</tbody></table>';
    tableContainer.innerHTML = tableHtml;
}

// Función para inicializar la escena de Three.js - mejorada para asegurar visibilidad
function initThreeJsScene() {
    try {
        // Obtiene el contenedor del modelo 3D del DOM
        const container = document.getElementById('modelContainer');
        if (!container) {
            console.error('Model container not found');
            return;
        }

        // Verifica que Three.js esté correctamente importado
        if (typeof THREE === 'undefined') {
            console.error('THREE is not defined. Make sure Three.js is properly imported.');
            return;
        }

        // Configura las dimensiones del contenedor
        const width = container.clientWidth || 400;  // Usa 400px como ancho predeterminado
        const height = container.clientHeight || 300;  // Usa 300px como alto predeterminado

        // Inicializa la escena y establece el color de fondo
        scene = new THREE.Scene();
        scene.background = new THREE.Color(0xf0f0f0);  // Color gris claro de fondo

        // Configura la cámara con perspectiva
        camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
        camera.position.set(0, 0, 30);  // Posiciona la cámara

        // Inicializa el renderizador con antialiasing
        renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(width, height);
        renderer.setPixelRatio(window.devicePixelRatio);

        // Limpia el contenedor y agrega el canvas del renderizador
        while (container.firstChild) {
            container.removeChild(container.firstChild);
        }
        container.appendChild(renderer.domElement);

        // Configura la iluminación de la escena
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);  // Luz ambiente brillante
        scene.add(ambientLight);
        
        const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);  // Luz direccional
        directionalLight.position.set(10, 20, 15);
        scene.add(directionalLight);
        
        const hemisphereLight = new THREE.HemisphereLight(0xffffbb, 0x080820, 0.6);  // Luz hemisférica
        scene.add(hemisphereLight);

    // // Define el color del placeholder según el estado del hígado
    // let placeholderColor;
    // switch (data.liver_state) {
    //     case 'Sano':
    //         placeholderColor = 0x8B0000; // Rojo oscuro para hígado sano
    //         break;
    //     case 'NAFLD':
    //         placeholderColor = 0xDAA520; // Dorado para NAFLD
    //         break;
    //     case 'NASH':
    //         placeholderColor = 0x8B4513; // Marrón para NASH
    //         break;
    //     default:
    //         placeholderColor = 0x8B0000; // Color por defecto
    // }        // Configura los controles orbitales si están disponibles
        if (typeof THREE.OrbitControls !== 'undefined') {
            controls = new THREE.OrbitControls(camera, renderer.domElement);
            controls.enableDamping = true;  // Añade suavidad al movimiento
            controls.dampingFactor = 0.25;
            controls.enableZoom = true;  // Permite hacer zoom
        } else {
            console.warn('OrbitControls not available. Make sure it is properly imported.');
        }

        // Marca la escena como inicializada y comienza la animación
        isSceneInitialized = true;
        animate();
        
        // Agrega listener para redimensionar la escena cuando cambia el tamaño de la ventana
        window.addEventListener('resize', onWindowResize);
        console.log('Three.js scene initialized successfully');
    } catch (error) {
        console.error('Error initializing Three.js scene:', error);
        alert('Error initializing 3D visualization. Please make sure Three.js is properly loaded.');
    }
}

// Animation loop
function animate() {
    requestAnimationFrame(animate);
    if (controls && controls.update) controls.update();
    if (renderer && scene && camera) {
        renderer.render(scene, camera);
    }
}

// Handle window resize
function onWindowResize() {
    const container = document.getElementById('modelContainer');
    if (!container) return;
    
    const width = container.clientWidth;
    const height = container.clientHeight;

    if (camera && renderer) {
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height);
    }
}

// Cleanup Three.js resources
function cleanupThreeJsScene() {
    if (renderer) {
        renderer.dispose();
        renderer.domElement.remove();
        renderer = null;
    }
    if (scene) {
        scene.clear();
        scene = null;
    }
    camera = null;
    if (controls) {
        controls.dispose();
        controls = null;
    }
    liver = null;
    isSceneInitialized = false;
}

// Analizar datos con estado de carga
async function analyzeData() {
    try {
        // Mostrar estado de carga
        analyzeButton.disabled = true;
        analyzeButton.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Analizando...';

        const analysisData = {
            logfc_thresh: parseFloat(logfcThreshold.value),
            p_adj_thresh: parseFloat(pvalThreshold.value),
            manual_state: 'Auto',
            h_nafld_path: fileData.hNafld.path,
            h_nash_path: fileData.hNash.path,
            nafld_nash_path: fileData.nafldNash.path
        };

        const response = await fetch('/api/analyze', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(analysisData)
        });

        if (!response.ok) {
            throw new Error(`¡Error HTTP! estado: ${response.status}`);
        }

        const data = await response.json();
        displayResults(data);
        createVolcanoPlots(data.volcano_data);
        
        // Initialize the scene if it's not already initialized
        if (!isSceneInitialized) {
            initThreeJsScene();
        }
        
        generateLiverModel(data.liver_state);
        
        // Try to show results tab if it exists
        const resultsTab = document.getElementById('results-tab');
        if (resultsTab && resultsTab.click) {
            resultsTab.click();
        }
    } catch (error) {
        console.error('Error al analizar los datos:', error);
        alert('Error al analizar los datos. Por favor, inténtalo de nuevo.');
    } finally {
        // Restaurar estado del botón
        analyzeButton.disabled = false;
        analyzeButton.textContent = 'Analizar Datos';
    }
}

// Mostrar resultados
function displayResults(data) {
    updateDEGCounts(data.counts);
    updateLiverState(data.liver_state);
}

// Actualizar conteo de DEGs
function updateDEGCounts(counts) {
    document.getElementById('hNafldCount').textContent = counts.h_nafld;
    document.getElementById('hNashCount').textContent = counts.h_nash;
    document.getElementById('nafldNashCount').textContent = counts.nafld_nash;
}

// Actualizar estado hepático
function updateLiverState(state) {
    const stateElement = document.getElementById('liverStateResult');
    stateElement.textContent = state;
    stateElement.className = 'display-4 mb-4';
    
    switch (state) {
        case 'Sano':
            stateElement.classList.add('text-success');
            break;
        case 'NAFLD':
            stateElement.classList.add('text-warning');
            break;
        case 'NASH':
            stateElement.classList.add('text-danger');
            break;
    }
}

// Crear gráficos de volcanos con manejo de errores
function createVolcanoPlots(volcanoData) {
    try {
        if (!volcanoData) {
            throw new Error('No se proporcionaron datos de volcanos');
        }

        createVolcanoPlot('hNafldVolcanoPlot', volcanoData.h_nafld, 'Sano vs NAFLD');
        createVolcanoPlot('hNashVolcanoPlot', volcanoData.h_nash, 'Sano vs NASH');
        createVolcanoPlot('nafldNashVolcanoPlot', volcanoData.nafld_nash, 'NAFLD vs NASH');
    } catch (error) {
        console.error('Error al crear los gráficos de volcanos:', error);
        ['hNafldVolcanoPlot', 'hNashVolcanoPlot', 'nafldNashVolcanoPlot'].forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                element.innerHTML = '<div class="alert alert-danger">Error al crear el gráfico. Por favor, inténtalo de nuevo.</div>';
            }
        });
    }
}

// Create individual volcano plot
function createVolcanoPlot(elementId, data, title) {
    if (!data || !data.x || data.x.length === 0) {
        document.getElementById(elementId).innerHTML = 
            '<div class="alert alert-info">No data available for this plot.</div>';
        return;
    }

    const trace = {
        x: data.x,
        y: data.y,
        mode: 'markers',
        type: 'scatter',
        marker: {
            color: data.is_significant.map(sig => sig ? '#dc3545' : '#6c757d'),
            size: 6,
            opacity: 0.7
        }
    };

    const layout = {
        title: title,
        xaxis: {
            title: 'Log2 Fold Change',
            zeroline: true,
            zerolinecolor: '#969696',
            zerolinewidth: 1
        },
        yaxis: {
            title: '-Log10(p-adj)',
            zeroline: true
        },
        shapes: [
            {
                type: 'line',
                x0: -1,
                y0: 0,
                x1: -1,
                y1: Math.max(...data.y) * 1.1,
                line: { color: 'rgba(0,0,0,0.5)', width: 1, dash: 'dash' }
            },
            {
                type: 'line',
                x0: 1,
                y0: 0,
                x1: 1,
                y1: Math.max(...data.y) * 1.1,
                line: { color: 'rgba(0,0,0,0.5)', width: 1, dash: 'dash' }
            },
            {
                type: 'line',
                x0: -10,
                y0: -Math.log10(0.05),
                x1: 10,
                y1: -Math.log10(0.05),
                line: { color: 'rgba(0,0,0,0.5)', width: 1, dash: 'dash' }
            }
        ]
    };

    Plotly.newPlot(elementId, [trace], layout);
}

// Función asíncrona para generar el modelo del hígado
// Recibe como parámetro el estado del hígado (Sano, NAFLD o NASH)
async function generateLiverModel(liverState) {
    try {
        // Registra en consola el estado del hígado que se va a generar
        console.log(`Generating liver model for state: ${liverState}`);
        
        // Realiza una petición POST al endpoint /api/liver-model
        // Envía el estado del hígado como parte del cuerpo de la petición
        const response = await fetch('/api/liver-model', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ liver_state: liverState })
        });

        // Procesa la respuesta del servidor
        const data = await response.json();
        
        // Actualiza el modelo 3D del hígado con los nuevos datos
        updateLiverModel(data);
        
        // Actualiza la descripción del modelo en la interfaz
        updateModelDescription(data);
    } catch (error) {
        // Maneja cualquier error que pueda ocurrir durante el proceso
        console.error('Error generating liver model:', error);
    }
}


// Si tan solo me miraras como antes
// Como cuando yo era todo para ti
// Creo que ya nunca veremos los Alpes
// Así como nunca me verás a mí
// No puede ser, ¿qué te pasó?, ¿te olvidaste de mí?
// Amaneció y de pronto ya no estás sobre mí
// Y sigo aquí, esperando respuestas
// Y sigo aquí, preguntándome
// Si tan solo me miraras como antes
// Como cuando yo era todo para ti
// Creo que ya nunca veremos los Alpes
// Así como nunca me verás a mí
// Se tuvo que ir, no vio lo que dejó
// Me dio la vida y me la destruyó
// No te culpo, si fuera yo me dejaría también, eh
// Tragando mis palabras
// Porque a todos les decía que eras tú y eso lo juraba
// Y ahora parezco mentiroso y me pregunto
// Si tan solo me miraras como antes
// Como cuando yo era todo para ti
// Creo que ya nunca veremos los Alpes
// Así como nunca me verás a mí
// Estoy sobrio, pero pronto no estaré, oh-eh
// Porque me haces falta, mucho más que ayer
// Qué pena para mí
// Y sigo aquí, esperando respuesta
// Y sigo aquí, preguntándome
// Si tan solo me miraras como antes
// Como cuando yo era todo para ti
// Creo que ya nunca veremos los Alpes
// Así como nunca me verás a mí

// Función para actualizar el modelo del hígado - crea un placeholder mientras se carga el modelo OBJ
function updateLiverModel(data) {
    // Verifica si la escena está inicializada
    if (!scene) {
        console.error('Scene not initialized. Cannot update liver model.');
        return;
    }

    // Limpia el modelo anterior si existe
    if (liver) {
        scene.remove(liver);
        liver = null;
    }

    // Define el color del placeholder según el estado del hígado
    let placeholderColor;
    switch (data.liver_state) {
        case 'Sano':
            placeholderColor = 0x8B0000; // Rojo oscuro para hígado sano
            break;
        case 'NAFLD':
            placeholderColor = 0xDAA520; // Dorado para NAFLD
            break;
        case 'NASH':
            placeholderColor = 0x8B4513; // Marrón para NASH
            break;
        default:
            placeholderColor = 0x8B0000; // Color por defecto
    }

    // Crea una esfera como placeholder temporal
    const placeholderGeometry = new THREE.SphereGeometry(10, 32, 32);
    const placeholderMaterial = new THREE.MeshPhongMaterial({ 
        color: placeholderColor,
        specular: 0x444444,  // Reflejo especular
        shininess: 30        // Brillo del material
    });
    liver = new THREE.Mesh(placeholderGeometry, placeholderMaterial);
    scene.add(liver);

    // Selecciona el archivo OBJ según el estado del hígado
    let objFile = '/static/models/liver_sano_model.obj';
    switch (data.liver_state) {
        case 'Sano':
            objFile = '/static/models/liver_sano_model.obj';
            break;
        case 'NAFLD':
            objFile = '/static/models/liver_nafld_model.obj';
            break;
        case 'NASH':
            objFile = '/static/models/liver_nash_model.obj';
            break;
        default:
            objFile = '/static/models/liver_sano_model.obj';
    }

    // Verifica si el cargador OBJ está disponible
    if (typeof THREE.OBJLoader === 'undefined') {
        console.error('THREE.OBJLoader is not defined. Make sure it is properly imported.');
        return;
    }

    // Configura el cargador y el gestor de carga
    const manager = new THREE.LoadingManager();
    manager.onProgress = function(item, loaded, total) {
        console.log(`Loading: ${item} (${loaded}/${total})`);
    };
    manager.onError = function(url) {
        console.error(`Error loading: ${url}`);
    };
    
    const loader = new THREE.OBJLoader(manager); // 
    

    // Carga el modelo OBJ
    loader.load(
        objFile,
        // Callback de éxito
        function(object) {
            console.log('OBJ model loaded successfully');
            // Elimina el placeholder
            if (liver) {
                scene.remove(liver);
                liver = null;
            }
            // Configura escala y posición
            object.scale.set(8, 8, 8);
            object.position.set(0, 0, 0);

            // Aplica materiales según el estado del hígado
            object.traverse(function (child) {
                if (child instanceof THREE.Mesh) {
                    // Asigna material según el estado
                    switch (data.liver_state) {
                        case 'Sano':
                            child.material = new THREE.MeshPhongMaterial({
                                color: 0x8B0000,     // Rojo oscuro
                                specular: 0x333333,   // Reflejo suave
                                shininess: 30         // Brillo alto
                            });
                            break;
                        case 'NAFLD':
                            child.material = new THREE.MeshPhongMaterial({
                                color: 0xDAA520,     // Amarillo dorado
                                specular: 0x333333,   // Reflejo suave
                                shininess: 25         // Brillo medio
                            });
                            break;
                        case 'NASH':
                            child.material = new THREE.MeshPhongMaterial({
                                color: 0x8B4513,     // Marrón
                                specular: 0x222222,   // Reflejo más suave
                                shininess: 20         // Brillo bajo
                            });
                            break;
                        default:
                            child.material = new THREE.MeshPhongMaterial({
                                color: 0x8B0000,     // Rojo por defecto
                                specular: 0x333333,
                                shininess: 30
                            });
                    }
                    // Habilita sombras
                    child.castShadow = true;
                    child.receiveShadow = true;
                }
            });

            // Añade el modelo a la escena
            liver = object;
            scene.add(liver);
            camera.position.z = 1000;

            // Actualiza los controles si existen
            if (controls) {
                controls.update();
                controls.saveState && controls.saveState();
            }
        },
        // Callback de progreso
        function(xhr) {
            const percentComplete = (xhr.loaded / xhr.total) * 100;
            console.log(`Model ${percentComplete.toFixed(2)}% loaded`);
        },
        // Callback de error
        function(error) {
            console.error('Error loading OBJ model:', error);
        }
    );
}

// Update model description
function updateModelDescription(data) {
    const description = document.getElementById('modelDescription');
    if (!description) {
        console.error('Model description element not found');
        return;
    }
    
    const features = data.features || { spots: { count: 0 } };
    
    let html = '<div class="card">';
    
    // Set card header based on liver state
    switch (data.liver_state) {
        case 'Sano':
            html += '<div class="card-header bg-success text-white">Healthy Liver</div>';
            break;
        case 'NAFLD':
            html += '<div class="card-header bg-warning text-dark">NAFLD Liver</div>';
            break;
        case 'NASH':
            html += '<div class="card-header bg-danger text-white">NASH Liver</div>';
            break;
    }
    
    html += '<div class="card-body"><ul class="list-group list-group-flush">';
    
    // Add state-specific characteristics
    switch (data.liver_state) {
        case 'Sano':
            html += `
                <li class="list-group-item">Color: Rojo oscuro uniforme</li>
                <li class="list-group-item">Textura: Suave y homogénea</li>
                <li class="list-group-item">Vasos sanguíneos: Bien definidos y prominentes</li>
                <li class="list-group-item">Lesiones: Ninguna</li>
            `;
            break;
        case 'NAFLD':
            html += `
                <li class="list-group-item">Color: Amarillento (acumulación de grasa)</li>
                <li class="list-group-item">Textura: Ligeramente grasa</li>
                <li class="list-group-item">Vasos sanguíneos: Visibilidad reducida</li>
                <li class="list-group-item">Lesiones: Pequeños depósitos de grasa (${features.spots.count})</li>
            `;
            break;
        case 'NASH':
            html += `
                <li class="list-group-item">Color: Marrón claro</li>
                <li class="list-group-item">Textura: Nodular con fibrosis</li>
                <li class="list-group-item">Vasos sanguíneos: Apenas visibles</li>
                <li class="list-group-item">Lesiones: Múltiples nódulos inflamatorios (${features.spots.count})</li>
            `;
            break;
    }
    
    html += `</ul></div>
        <div class="card-footer">
            <h6>Explicación:</h6>
            <p class="mb-0 small">Este modelo 3D ilustra los cambios progresivos en el hígado durante
            la enfermedad del hígado graso no alcohólico. La acumulación de grasa y la inflamación progresiva alteran la
            apariencia, textura y función del órgano.</p>
        </div>
    </div>`;
    
    description.innerHTML = html;
}

// Add cleanup on page unload
window.addEventListener('beforeunload', cleanupThreeJsScene);