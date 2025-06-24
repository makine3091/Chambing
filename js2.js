// =======================
// EXPORTAR PROYECTO
// =======================
function exportToGLB(exportType = 'combined') {
    // Verificar que THREE y el exportador estén disponibles
    if (typeof THREE === "undefined" || !THREE.GLTFExporter || typeof window.scene === "undefined" || !(window.scene instanceof THREE.Scene)) {
        return;
    }
    
    const exporter = new THREE.GLTFExporter();
    
    // Obtener todos los objetos elegibles para exportar
    const exportableMeshes = window.scene.children.filter(object => 
        object.isMesh && 
        object.type === "Mesh" && 
        (!object.name || (!object.name.includes("Helper") && 
                         !object.name.includes("TransformControls") && 
                         !object.name.includes("Axes"))) && 
        object.parent && 
        object.parent.type === "Scene"
    );

    if (exportableMeshes.length === 0) {
        return;
    }

    // Crear metadata con información de texturas y posiciones
    const projectMetadata = {
        version: "1.0",
        timestamp: new Date().toISOString(),
        objects: exportableMeshes.map(mesh => ({
            id: mesh.uuid,
            name: mesh.userData?.name || "Sin nombre",
            position: {
                x: mesh.position.x,
                y: mesh.position.y,
                z: mesh.position.z
            },
            rotation: {
                x: mesh.rotation.x,
                y: mesh.rotation.y,
                z: mesh.rotation.z,
                order: mesh.rotation.order
            },
            scale: {
                x: mesh.scale.x,
                y: mesh.scale.y,
                z: mesh.scale.z
            },
            material: {
                color: mesh.material?.color?.getHex() || 0x808080,
                textureFile: mesh.material?.map?.image?.src || mesh.material?.map?.source?.data || null,
                texturePath: mesh.material?.userData?.texturePath || null,
                textureProvider: mesh.material?.userData?.textureProvider || null,
                textureKey: mesh.material?.userData?.textureKey || null
            },
            geometry: {
                type: mesh.geometry?.type || "BoxGeometry",
                parameters: mesh.geometry?.parameters || {}
            },
            userData: mesh.userData || {}
        }))
    };      if (exportType === 'separate') {
        // Exportar cada objeto por separado
        exportableMeshes.forEach((mesh, index) => {
            const clonedMesh = mesh.clone();
            clonedMesh.geometry = mesh.geometry.clone();
            clonedMesh.applyMatrix4(mesh.matrixWorld);
            
            // Conservar metadata del objeto original
            clonedMesh.userData = Object.assign({}, mesh.userData);
            if (mesh.material?.userData) {
                clonedMesh.material.userData = Object.assign({}, mesh.material.userData);
            }
            
            const fileName = mesh.userData && mesh.userData.name ? 
                `${mesh.userData.name}_${index}.glb` : `pieza_${index}.glb`;
            
            // Crear escena temporal para el objeto individual
            const tempScene = new THREE.Scene();
            tempScene.add(clonedMesh);
            
            // Añadir metadata individual al objeto
            tempScene.userData = {
                modulaProject: {
                    version: "1.0",
                    timestamp: new Date().toISOString(),
                    object: projectMetadata.objects[index]
                }
            };
            
            exporter.parse(tempScene, function(gltf) {
                forceDownload(fileName, gltf, 'model/gltf-binary');
            }, { binary: true });
        });
        
        showToastLocal(`${exportableMeshes.length} objetos exportados por separado`);
    } else {
        // Exportar todos los objetos juntos
        const meshesGroup = new THREE.Group();
        
        exportableMeshes.forEach(mesh => {
            const clonedMesh = mesh.clone();
            clonedMesh.geometry = mesh.geometry.clone();
            clonedMesh.applyMatrix4(mesh.matrixWorld);
            
            // Conservar metadata del objeto original
            clonedMesh.userData = Object.assign({}, mesh.userData);
            if (mesh.material?.userData) {
                clonedMesh.material.userData = Object.assign({}, mesh.material.userData);
            }
            
            meshesGroup.add(clonedMesh);
        });
        
        // Crear escena temporal para la exportación
        const tempScene = new THREE.Scene();
        tempScene.add(meshesGroup);
        
        // Añadir metadata completa del proyecto
        tempScene.userData = {
            modulaProject: projectMetadata
        };
        
        exporter.parse(tempScene, function(gltf) {
            forceDownload("escena.glb", gltf, 'model/gltf-binary');
        }, { binary: true });
        
        showToastLocal("Escena completa exportada");
    }
}

function forceDownload(filename, content, mimeType = "model/gltf-binary") {
    let blob = content instanceof ArrayBuffer ? new Blob([content], { type: mimeType }) : new Blob([content], { type: mimeType });
    let link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// Evento para el botón exportar solo si el elemento existe
const exportButton = document.getElementById("exportProjectButton");
if (exportButton) {
    exportButton.addEventListener("click", function () {
        // Exportar directamente como un solo archivo (sin diálogo)
        exportToGLB('combined');
    });
} else {
    console.error("No se encontró el botón de exportar proyecto");
}

// =======================
// IMPORTAR PROYECTO
// =======================
function generateBoxUVs(geometry) {
    geometry.computeBoundingBox();
    const bbox = geometry.boundingBox;
    const size = new THREE.Vector3();

    bbox.getSize(size);

    const posAttr = geometry.attributes.position;
    const uvAttr = [];

    // Asume que cada 3 vértices forman una cara
    for (let i = 0; i < posAttr.count; i += 3) {
        // Obtén los 3 vértices de la cara
        const v = [];
        for (let j = 0; j < 3; j++) {
            v.push(new THREE.Vector3(
                posAttr.getX(i + j),
                posAttr.getY(i + j),
                posAttr.getZ(i + j)
            ));
        }
        // Calcula la normal de la cara
        const edge1 = new THREE.Vector3().subVectors(v[1], v[0]);
        const edge2 = new THREE.Vector3().subVectors(v[2], v[0]);
        const normal = new THREE.Vector3().crossVectors(edge1, edge2).normalize();

        // Proyección según el eje dominante de la normal
        let u, vCoord;
        if (Math.abs(normal.x) > Math.abs(normal.y) && Math.abs(normal.x) > Math.abs(normal.z)) {
            // Proyección en YZ
            u = 'y'; vCoord = 'z';
        } else if (Math.abs(normal.y) > Math.abs(normal.z)) {
            // Proyección en XZ
            u = 'x'; vCoord = 'z';
        } else {
            // Proyección en XY
            u = 'x'; vCoord = 'y';
        }

        for (let j = 0; j < 3; j++) {
            const uVal = (v[j][u] - bbox.min[u]) / size[u];
            const vVal = (v[j][vCoord] - bbox.min[vCoord]) / size[vCoord];
            uvAttr.push(uVal, vVal);
        }
    }
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvAttr, 2));
}

// =======================
// IMPORTAR PROYECTO
// =======================

// Función de ayuda para mostrar mensajes al usuario, se define primero
// en caso de que no esté definida en js.js
function showToastLocal(message) {
    // Usamos la función showToast que debería estar definida en js.js
    if (typeof window.showToast === 'function') {
        window.showToast(message);
    } else {
        // Fallback en caso de que showToast no esté disponible
        console.log(message);
        alert(message);
    }
}

// Función para intentar separar una geometría en componentes individuales
function separateGeometry(geometry) {
    // Primero verificamos si la geometría ya tiene información de índices
    if (!geometry.index) {
        return [geometry]; // No podemos separar sin índices
    }
    
    console.log("Intentando separar geometría en componentes...");
    
    // Obtenemos los vértices y los índices
    const vertices = geometry.attributes.position.array;
    const indices = geometry.index.array;
    const positionCount = geometry.attributes.position.count;
    
    // Crear un mapa de conexiones entre vértices
    let vertexConnections = Array(positionCount).fill().map(() => []);
    for (let i = 0; i < indices.length; i += 3) {
        const a = indices[i];
        const b = indices[i + 1];
        const c = indices[i + 2];
        
        vertexConnections[a].push(b, c);
        vertexConnections[b].push(a, c);
        vertexConnections[c].push(a, b);
    }
    
    // Función para encontrar todos los vértices conectados (búsqueda en profundidad)
    function findConnectedVertices(start) {
        const visited = new Set();
        const queue = [start];
        
        while (queue.length > 0) {
            const vertex = queue.pop();
            if (visited.has(vertex)) continue;
            
            visited.add(vertex);
            
            for (const neighbor of vertexConnections[vertex]) {
                if (!visited.has(neighbor)) {
                    queue.push(neighbor);
                }
            }
        }
        
        return visited;
    }
    
    // Encontrar todos los componentes conectados
    const components = [];
    const visitedVertices = new Set();
    
    for (let i = 0; i < positionCount; i++) {
        if (visitedVertices.has(i)) continue;
        
        const connectedVertices = findConnectedVertices(i);
        connectedVertices.forEach(v => visitedVertices.add(v));
        
        if (connectedVertices.size > 10) { // Ignorar componentes muy pequeños
            components.push(Array.from(connectedVertices));
        }
    }
    
    if (components.length <= 1) {
        console.log("No se pueden separar componentes. La geometría parece ser una sola pieza.");
        return [geometry]; // No se encontraron componentes separados
    }
    
    console.log(`Se detectaron ${components.length} componentes separados.`);
    
    // Crear geometrías separadas para cada componente
    const separatedGeometries = [];
    
    for (const component of components) {
        // Crear nuevo buffer de geometría
        const newGeometry = new THREE.BufferGeometry();
        
        // Mapeo de índices originales a nuevos índices
        const indexMap = new Map();
        let newPositionArray = [];
        let newVertexCount = 0;
        
        // Recolectar vértices para este componente
        for (const vertexIndex of component) {
            indexMap.set(vertexIndex, newVertexCount++);
            
            // Copiar la posición del vértice
            const posIdx = vertexIndex * 3;
            newPositionArray.push(
                vertices[posIdx],
                vertices[posIdx + 1],
                vertices[posIdx + 2]
            );
        }
        
        // Crear los nuevos triángulos usando solo los índices de este componente
        let newIndices = [];
        for (let i = 0; i < indices.length; i += 3) {
            const a = indices[i];
            const b = indices[i + 1];
            const c = indices[i + 2];
            
            // Si los tres vértices están en este componente, agregamos el triángulo
            if (indexMap.has(a) && indexMap.has(b) && indexMap.has(c)) {
                newIndices.push(
                    indexMap.get(a),
                    indexMap.get(b),
                    indexMap.get(c)
                );
            }
        }
        
        // Asignar los atributos a la nueva geometría
        newGeometry.setAttribute('position', new THREE.Float32BufferAttribute(newPositionArray, 3));
        newGeometry.setIndex(newIndices);
        newGeometry.computeVertexNormals();
        
        separatedGeometries.push(newGeometry);
    }
    
    return separatedGeometries;
}

// Función mejorada para separar geometrías usando análisis de conectividad
function separateGeometry(geometry) {
    // Verificar si la geometría tiene índices
    if (!geometry.index) {
        console.log("No se pueden separar componentes: la geometría no tiene índices");
        return [geometry]; // No podemos separar sin índices
    }
    
    console.log("Intentando separar geometría en componentes...");
    
    const indices = geometry.index.array;
    const positionCount = geometry.attributes.position.count;
    
    // Estructura para rastrear componentes conectados
    const vertexComponents = new Array(positionCount).fill(-1); // -1 = no asignado
    let componentCount = 0;
    
    // Para cada triángulo, conectar sus vértices
    for (let i = 0; i < indices.length; i += 3) {
        const a = indices[i], b = indices[i + 1], c = indices[i + 2];
        
        // Si alguno de los vértices ya está en un componente, usar ese componente para todos
        let componentId = Math.max(vertexComponents[a], vertexComponents[b], vertexComponents[c]);
        
        // Si no hay componente asignado, crear uno nuevo
        if (componentId < 0) {
            componentId = componentCount++;
        }
        
        // Si hay que fusionar componentes
        const componentsToMerge = [vertexComponents[a], vertexComponents[b], vertexComponents[c]]
            .filter(id => id >= 0 && id !== componentId);
            
        if (componentsToMerge.length > 0) {
            for (let j = 0; j < vertexComponents.length; j++) {
                if (componentsToMerge.includes(vertexComponents[j])) {
                    vertexComponents[j] = componentId;
                }
            }
        }
        
        // Asignar el componente a todos los vértices del triángulo
        vertexComponents[a] = vertexComponents[b] = vertexComponents[c] = componentId;
    }
    
    // Contar cuántos componentes distintos tenemos
    const uniqueComponents = new Set(vertexComponents.filter(c => c >= 0));
    console.log(`Se encontraron ${uniqueComponents.size} componentes conectados`);
    
    if (uniqueComponents.size <= 1) {
        return [geometry]; // No se encontraron componentes separados
    }
    
    // Crear geometrías separadas para cada componente
    const componentGeometries = [];
    
    uniqueComponents.forEach(componentId => {
        // Obtener todos los triángulos para este componente
        const componentTriangles = [];
        
        for (let i = 0; i < indices.length; i += 3) {
            const a = indices[i];
            if (vertexComponents[a] === componentId) {
                componentTriangles.push(a, indices[i + 1], indices[i + 2]);
            }
        }
        
        if (componentTriangles.length > 0) {
            // Crear una nueva geometría para este componente
            const componentGeo = new THREE.BufferGeometry();
            
            // Copiar todos los atributos de la geometría original
            Object.keys(geometry.attributes).forEach(attrName => {
                componentGeo.setAttribute(attrName, geometry.attributes[attrName].clone());
            });
            
            // Establecer nuevos índices solo para este componente
            componentGeo.setIndex(componentTriangles);
            componentGeo.computeVertexNormals();
            
            componentGeometries.push(componentGeo);
        }
    });
    
    return componentGeometries.length > 0 ? componentGeometries : [geometry];
}

// Función optimizada para importar GLB/GLTF o STL
function handleImportGLB(event) {
    const file = event.target.files[0];
    if (!file) {
        return;
    }
    
    // Determinar tipo de archivo
    const isGLB = file.name.toLowerCase().endsWith('.glb');
    const isGLTF = file.name.toLowerCase().endsWith('.gltf');
    const isSTL = file.name.toLowerCase().endsWith('.stl');
    
    if (!isGLB && !isGLTF && !isSTL) {
        return;
    }
    
    const reader = new FileReader();
    reader.onload = function (e) {
        if (typeof THREE === "undefined" || typeof window.scene === "undefined") {
            return;
        }
        
        // Verificar que los loaders necesarios estén disponibles
        if ((isGLB || isGLTF) && !THREE.GLTFLoader) {
            return;
        }
        
        if (isSTL && !THREE.STLLoader) {
            return;
        }

        try {
            if (isGLB || isGLTF) {
                // Importación de GLB/GLTF con metadata mejorada
                const loader = new THREE.GLTFLoader();
                
                loader.parse(e.target.result, '', function(gltf) {
                    if (!gltf || !gltf.scene) {
                        return;
                    }
                    
                    let importCount = 0;
                    const meshes = [];
                    let projectMetadata = null;
                    
                    // Verificar si hay metadata del proyecto en la escena
                    if (gltf.scene.userData && gltf.scene.userData.modulaProject) {
                        projectMetadata = gltf.scene.userData.modulaProject;
                        console.log("Metadata del proyecto encontrada:", projectMetadata);
                    }
                    
                    // Función auxiliar para restaurar textura
                    async function restoreTexture(materialInfo, material) {
                        if (!materialInfo) return;
                        
                        let textureToApply = null;
                        
                        // Intentar restaurar desde la información guardada
                        if (materialInfo.texturePath) {
                            try {
                                // Verificar si la textura existe en caché
                                if (window.textures && window.textures.cache && window.textures.cache.has(materialInfo.texturePath)) {
                                    textureToApply = window.textures.cache.get(materialInfo.texturePath);
                                } else {
                                    // Cargar la textura
                                    const textureLoader = window.textureLoader || new THREE.TextureLoader();
                                    textureToApply = await new Promise((resolve, reject) => {
                                        textureLoader.load(
                                            materialInfo.texturePath,
                                            resolve,
                                            undefined,
                                            reject
                                        );
                                    });
                                    
                                    // Añadir al caché si existe
                                    if (window.textures && window.textures.cache) {
                                        window.textures.cache.set(materialInfo.texturePath, textureToApply);
                                    }
                                }
                                
                                // Aplicar la textura
                                if (textureToApply) {
                                    textureToApply.wrapS = textureToApply.wrapT = THREE.RepeatWrapping;
                                    textureToApply.repeat.set(1, 1);
                                    material.map = textureToApply;
                                    material.needsUpdate = true;
                                    
                                    // Restaurar información de la textura en el material
                                    if (!material.userData) material.userData = {};
                                    material.userData.texturePath = materialInfo.texturePath;
                                    if (materialInfo.textureProvider) material.userData.textureProvider = materialInfo.textureProvider;
                                    if (materialInfo.textureKey) material.userData.textureKey = materialInfo.textureKey;
                                    if (materialInfo.textureName) material.userData.textureName = materialInfo.textureName;
                                }
                            } catch (error) {
                                console.warn("No se pudo restaurar la textura:", materialInfo.texturePath, error);
                            }
                        }
                        
                        // Restaurar color del material
                        if (materialInfo.color !== undefined) {
                            material.color.setHex(materialInfo.color);
                        }
                    }
                    
                    // Recorrer todos los hijos del objeto importado
                    gltf.scene.traverse(child => {
                        if (child instanceof THREE.Mesh) {
                            // Hacer una copia de la geometría para procesarla
                            const geo = child.geometry.clone();
                            
                            // Asignar material estándar si no tiene material
                            let material = child.material ? child.material.clone() : 
                                          new THREE.MeshStandardMaterial({ 
                                              color: 0x888888, 
                                              side: THREE.DoubleSide 
                                          });
                            
                            // Crear un nuevo mesh para cada objeto de forma independiente
                            const mesh = new THREE.Mesh(geo, material);
                            
                            // Buscar metadata específica para este objeto
                            let objectMetadata = null;
                            if (projectMetadata && projectMetadata.objects) {
                                objectMetadata = projectMetadata.objects[importCount] || 
                                               projectMetadata.objects.find(obj => obj.name === child.name) ||
                                               (projectMetadata.objects.length === 1 ? projectMetadata.objects[0] : null);
                            }
                            
                            // Configurar metadata con ID único
                            const uniqueId = Date.now() + "_" + Math.floor(Math.random() * 1000);
                            mesh.name = `ImportedMesh_${uniqueId}_${importCount}`;
                            
                            if (objectMetadata) {
                                mesh.userData = Object.assign({}, objectMetadata.userData || {});
                                mesh.userData.name = objectMetadata.name || `Pieza importada ${importCount+1}`;
                                mesh.userData.type = "ImportedMesh";
                                mesh.userData.importId = uniqueId;
                                
                                // Restaurar transformaciones desde metadata
                                if (objectMetadata.position) {
                                    mesh.position.set(
                                        objectMetadata.position.x || 0,
                                        objectMetadata.position.y || 0,
                                        objectMetadata.position.z || 0
                                    );
                                }
                                if (objectMetadata.rotation) {
                                    mesh.rotation.set(
                                        objectMetadata.rotation.x || 0,
                                        objectMetadata.rotation.y || 0,
                                        objectMetadata.rotation.z || 0
                                    );
                                    if (objectMetadata.rotation.order) {
                                        mesh.rotation.order = objectMetadata.rotation.order;
                                    }
                                }
                                if (objectMetadata.scale) {
                                    mesh.scale.set(
                                        objectMetadata.scale.x || 1,
                                        objectMetadata.scale.y || 1,
                                        objectMetadata.scale.z || 1
                                    );
                                }
                                
                                // Restaurar material y texturas
                                if (objectMetadata.material) {
                                    restoreTexture(objectMetadata.material, material);
                                }
                            } else {
                                // Usar configuración por defecto si no hay metadata
                                mesh.userData = {
                                    name: gltf.scene.children.length > 1 ? `Pieza importada ${importCount+1}` : "Pieza importada",
                                    type: "ImportedMesh",
                                    importId: uniqueId
                                };
                                
                                // Copiar la transformación del objeto original
                                if (child.position) mesh.position.copy(child.position);
                                if (child.rotation) mesh.rotation.copy(child.rotation);
                                if (child.scale) mesh.scale.copy(child.scale);
                            }
                            
                            // Asegurarse de que la geometría tenga bounding box
                            if (mesh.geometry) {
                                mesh.geometry.computeBoundingBox();
                            }
                            
                            meshes.push(mesh);
                            importCount++;
                        }
                    });
                      // Solo aplicar disposición en cuadrícula si NO hay metadata de posiciones
                    if (!projectMetadata || !projectMetadata.objects || projectMetadata.objects.length === 0) {
                        // Calcular disposición en cuadrícula si hay múltiples piezas
                        const gridSize = Math.ceil(Math.sqrt(meshes.length));
                        const spacing = 20; // Espacio entre objetos
                        
                        // Añadir los meshes a la escena con posicionamiento en cuadrícula
                        meshes.forEach((mesh, i) => {
                            // Posicionar en cuadrícula si son múltiples objetos
                            if (meshes.length > 1) {
                                const col = i % gridSize;
                                const row = Math.floor(i / gridSize);
                                mesh.position.set(
                                    col * spacing - (gridSize * spacing / 2),
                                    0,
                                    row * spacing - (gridSize * spacing / 2)
                                );
                            } else {
                                // Para un solo objeto, mantener posición original o centrar en origen
                                mesh.position.set(0, 0, 0);
                            }
                            
                            // Añadir cada mesh directamente a la escena sin agruparlos
                            window.scene.add(mesh);
                        });
                    } else {
                        // Si hay metadata, simplemente añadir los meshes con sus posiciones restauradas
                        meshes.forEach(mesh => {
                            window.scene.add(mesh);
                        });
                    }
                    
                    // Mensaje de éxito
                    const hasMetadata = projectMetadata && projectMetadata.objects && projectMetadata.objects.length > 0;
                    showToastLocal(importCount > 1 
                        ? `Se importaron ${importCount} objetos GLB/GLTF${hasMetadata ? ' con texturas y posiciones restauradas' : ''}` 
                        : `Objeto GLB/GLTF importado${hasMetadata ? ' con texturas y posiciones restauradas' : ''}`);
                        
                    // Limpiar la selección
                    if (window.transformControls) {
                        window.transformControls.visible = false;
                        window.transformControls.detach();
                    }
                    
                    // Resetear selección
                    if (window.selectedObject) window.selectedObject = null;
                    if (window.selectedObjects) window.selectedObjects = [];
                    
                    // Guardar estado para deshacer/rehacer
                    if (typeof window.saveState === 'function') {
                        window.saveState();
                    }
                    
                }, function(error) {
                    console.error("Error al cargar GLB/GLTF:", error);
                    showToastLocal("Error al procesar el archivo GLB/GLTF");
                });
            }
            else if (isSTL) {
                // Importación de STL (sin cambios significativos)
                const loader = new THREE.STLLoader();
                const geometry = loader.parse(e.target.result);
                
                if (!geometry) {
                    showToastLocal("Error al procesar el archivo STL");
                    return;
                }
                
                // Generar UVs y calcular normales
                generateBoxUVs(geometry);
                geometry.computeVertexNormals();
                geometry.computeBoundingBox();
                
                // Crear material
                const material = new THREE.MeshStandardMaterial({
                    color: 0xcccccc,
                    flatShading: true,
                    side: THREE.DoubleSide
                });
                  // Crear mesh
                const uniqueId = Date.now() + "_" + Math.floor(Math.random() * 1000);
                const mesh = new THREE.Mesh(geometry, material);
                mesh.name = `ImportedSTL_${uniqueId}`;
                mesh.userData = {
                    name: "Modelo STL importado",
                    type: "ImportedMesh",
                    importId: uniqueId
                };
                
                // Posicionar en el origen
                mesh.position.set(0, 0, 0);
                
                // Añadir a la escena
                window.scene.add(mesh);
                
                // Mensaje de éxito
                showToastLocal("Modelo STL importado correctamente");
            }            
            // Limpiar la selección
            if (window.transformControls) {
                window.transformControls.visible = false;
                window.transformControls.detach();
            }
            
            // Resetear selección
            if (window.selectedObject) window.selectedObject = null;
            if (window.selectedObjects) window.selectedObjects = [];
            
            // Guardar estado para deshacer/rehacer
            if (typeof window.saveState === 'function') {
                window.saveState();
            }
        } catch (error) {
            console.error("Error al importar archivo:", error);
            showToastLocal(`Error al importar el archivo ${(isGLB || isGLTF) ? "GLB/GLTF" : "STL"}`);
        }
    };
    
    reader.onerror = () => showToastLocal("Error al leer el archivo");
    
    // Usar el método adecuado según el tipo de archivo
    if (isSTL) {
        reader.readAsArrayBuffer(file); // STL es binario
    } else if (isGLB) {
        reader.readAsArrayBuffer(file); // GLB es binario
    } else if (isGLTF) {
        reader.readAsText(file); // GLTF es texto JSON
    }
}

// Verificar que los elementos HTML existan
const importButton = document.getElementById("importProjectButton");
const importInput = document.getElementById("importProjectInput");
if (!importButton || !importInput) {
    console.error("Elementos HTML para la importación no encontrados");
    showToastLocal("Error: Elementos HTML no encontrados");
} else {
    importButton.addEventListener("click", function () {
        importInput.click();
    });
    importInput.addEventListener("change", handleImportGLB);
    console.log("✅ Importación configurada correctamente");
}

// =======================
// EXPORTAR MEDIDAS (Formato personalizado)
// =======================
function exportMeasuresToExcel() {
    // Validar disponibilidad de bibliotecas y escena
    if (typeof THREE === "undefined" || typeof XLSX === "undefined" || 
        typeof window.scene === "undefined" || !(window.scene instanceof THREE.Scene)) {
        return;
    }

    // Obtener y agrupar piezas por dimensiones
    const piezas = {};
    const meshes = window.scene.children.filter(object => 
        object.isMesh && 
        object.type === "Mesh" && 
        (!object.parent || object.parent.type === "Scene") && 
        object.userData && object.userData.name
    );
    
    // Si no hay objetos, mostrar error
    if (meshes.length === 0) {
        return;
    }
    
    // Procesar cada objeto para agruparlos por dimensiones
    meshes.forEach(object => {
        object.geometry.computeBoundingBox();
        const bbox = object.geometry.boundingBox;
        const width = ((bbox.max.x - bbox.min.x) * object.scale.x).toFixed(2);
        const height = ((bbox.max.y - bbox.min.y) * object.scale.y).toFixed(2);
        const descripcion = object.userData.name || "Sin Nombre";
        const key = `${descripcion}|${height}|${width}`;
        
        if (!piezas[key]) {
            piezas[key] = { cantidad: 1, descripcion, height, width };
        } else {
            piezas[key].cantidad += 1;
        }
    });
    
    // Crear estructura de datos para Excel
    const data = [
        ["Lámina a optimizar", "", "", "", "", "", ""],
        [],
        ["Cantidad", "Descripción", "Alto (cm)", "Ancho (cm)", "Puede Rotar", "Enchape", "Canto"]
    ];
    
    // Añadir filas de piezas
    Object.values(piezas).forEach(pieza => {
        data.push([
            pieza.cantidad,
            pieza.descripcion,
            pieza.height,
            pieza.width,
            "Sí", // Puede Rotar
            "",   // Enchape
            ""    // Canto
        ]);
    });
    
    // Crear y guardar el archivo Excel
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, "Lámina a optimizar");
    
    const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    const blob = new Blob([wbout], { 
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" 
    });
    
    // Descargar archivo
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "lamina_a_optimizar.xlsx";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    showToastLocal("Medidas exportadas correctamente");
}

// Evento para el botón exportar medidas solo si el elemento existe
const exportMeasuresButton = document.getElementById("exportMeasuresButton");
if (exportMeasuresButton) {
    exportMeasuresButton.addEventListener("click", exportMeasuresToExcel);
} else {
    console.error("No se encontró el botón de exportar medidas");
}

// Eliminar con la tecla Suprimir
document.addEventListener("keydown", function (event) {
    if (event.key === "Delete" || event.key === "Del") {
        deleteSelected();
    }
});


// =======================
// METRO DE MEDICIÓN TIPO SKETCHUP
// =======================
let metroPoints = [];
let metroActive = false;
let metroMeasures = []; // Guarda todas las mediciones activas
let metroPreview = null;
let metroPreviewLabel = null;

// Función auxiliar para crear puntos de snap de un objeto
function getObjectSnapPoints(obj) {
    if (!obj.isMesh || obj.geometry.type !== "BoxGeometry") return [];
    
    obj.geometry.computeBoundingBox();
    const bbox = obj.geometry.boundingBox;
    const min = bbox.min, max = bbox.max;
    const snapPoints = [];
    
    // Añadir los 8 vértices (esquinas)
    [
        [min.x, min.y, min.z], [min.x, min.y, max.z], 
        [min.x, max.y, min.z], [min.x, max.y, max.z],
        [max.x, min.y, min.z], [max.x, min.y, max.z], 
        [max.x, max.y, min.z], [max.x, max.y, max.z]
    ].forEach(([x, y, z]) => snapPoints.push(new THREE.Vector3(x, y, z)));
    
    // Añadir los centros de las 6 caras
    const midX = (min.x + max.x) / 2;
    const midY = (min.y + max.y) / 2;
    const midZ = (min.z + max.z) / 2;
    
    [
        [midX, min.y, midZ], [midX, max.y, midZ], // Caras Y
        [max.x, midY, midZ], [min.x, midY, midZ], // Caras X
        [midX, midY, min.z], [midX, midY, max.z]  // Caras Z
    ].forEach(([x, y, z]) => snapPoints.push(new THREE.Vector3(x, y, z)));
    
    // Añadir los puntos medios de las 12 aristas
    [
        // Aristas X
        [[min.x, min.y, min.z], [max.x, min.y, min.z]],
        [[min.x, min.y, max.z], [max.x, min.y, max.z]],
        [[min.x, max.y, min.z], [max.x, max.y, min.z]],
        [[min.x, max.y, max.z], [max.x, max.y, max.z]],
        // Aristas Y
        [[min.x, min.y, min.z], [min.x, max.y, min.z]],
        [[max.x, min.y, min.z], [max.x, max.y, min.z]],
        [[min.x, min.y, max.z], [min.x, max.y, max.z]],
        [[max.x, min.y, max.z], [max.x, max.y, max.z]],
        // Aristas Z
        [[min.x, min.y, min.z], [min.x, min.y, max.z]],
        [[max.x, min.y, min.z], [max.x, min.y, max.z]],
        [[min.x, max.y, min.z], [min.x, max.y, max.z]],
        [[max.x, max.y, min.z], [max.x, max.y, max.z]]
    ].forEach(([start, end]) => {
        snapPoints.push(
            new THREE.Vector3(
                (start[0] + end[0]) / 2,
                (start[1] + end[1]) / 2,
                (start[2] + end[2]) / 2
            )
        );
    });
    
    // Transformar todos los puntos al espacio mundial
    return snapPoints.map(v => v.applyMatrix4(obj.matrixWorld));
}

function getClosestSnapPoint(point, tolerance = 5) {
    let closest = null;
    let minDist = Infinity;
    
    // Filtrar objetos de tipo BoxGeometry para mejorar rendimiento
    const boxObjects = scene.children.filter(obj => 
        obj.isMesh && obj.geometry && obj.geometry.type === "BoxGeometry"
    );
    
    // Buscar el punto de snap más cercano
    boxObjects.forEach(obj => {
        getObjectSnapPoints(obj).forEach(snap => {
            const dist = snap.distanceTo(point);
            if (dist < minDist && dist < tolerance) {
                minDist = dist;
                closest = snap;
            }
        });
    });
    
    return closest;
}

// Helper para obtener un punto desde coordenadas de mouse
function getPointFromMouseEvent(event, raycaster) {
    const rect = renderer.domElement.getBoundingClientRect();
    const clientX = event.touches && event.touches.length ? event.touches[0].clientX : event.clientX;
    const clientY = event.touches && event.touches.length ? event.touches[0].clientY : event.clientY;
    
    const mouse = new THREE.Vector2(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1
    );
    
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(
        scene.children.filter(obj => obj.isMesh && obj.type === "Mesh"), 
        true
    );
    
    if (intersects.length > 0) {
        return intersects[0].point.clone();
    } else {
        // Intersectar con el plano horizontal si no hay objeto
        const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
        const target = new THREE.Vector3();
        if (raycaster.ray.intersectPlane(plane, target)) {
            return target.clone();
        }
    }
    
    return null;
}

// Crear elemento DOM para la etiqueta
function createMeasureLabel(position, distance) {
    const distanceCm = distance * 100;
    const distanceText = distanceCm >= 100 ? 
        `${(distanceCm / 100).toFixed(2)} cm` : 
        `${distanceCm.toFixed(1)} mm`;
    
    const label = document.createElement("input");
    label.type = "text";
    label.value = distanceText;
    
    // Estilos comunes
    Object.assign(label.style, {
        position: "fixed",
        background: "#222e3c",
        color: "#fff",
        padding: "6px 14px",
        borderRadius: "8px",
        fontSize: "18px",
        zIndex: "9999",
        pointerEvents: "auto",
        cursor: "pointer",
        border: "1px solid #444",
        width: "110px",
        textAlign: "center"
    });
    
    // Posicionar en la pantalla
    const vector = position.clone().project(camera);
    const x = (vector.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-vector.y * 0.5 + 0.5) * window.innerHeight;
    label.style.left = `${x}px`;
    label.style.top = `${y - 20}px`;
    
    document.body.appendChild(label);
    return label;
}

function enableMetro() {
    showToast("Haz clic en dos puntos para medir. ESC para cancelar.");
    metroPoints = [];
    metroActive = true;
    renderer.domElement.style.cursor = "crosshair";
    removeMetroPreview();

    renderer.domElement.addEventListener("pointerdown", onMetroPointerDown, false);
    renderer.domElement.addEventListener("pointermove", onMetroPointerMove, false);
    window.addEventListener("keydown", onMetroKeyDown, false);
}

function removeMetroPreview() {
    if (metroPreview) {
        scene.remove(metroPreview.line);
        if (metroPreview.line.auxLines) {
            metroPreview.line.auxLines.forEach(aux => scene.remove(aux));
        }
        metroPreview.line.geometry.dispose();
        metroPreview.line.material.dispose();
        metroPreview = null;
    }
    
    if (metroPreviewLabel && metroPreviewLabel.parentNode) {
        metroPreviewLabel.parentNode.removeChild(metroPreviewLabel);
        metroPreviewLabel = null;
    }
}

function onMetroPointerDown(event) {
    if (!metroActive || event.button !== 0) return;
    controls.enablePan = true;
    
    const raycaster = new THREE.Raycaster();
    let point = getPointFromMouseEvent(event, raycaster);
    
    if (point) {
        // SNAP a esquina más cercana
        const snapped = getClosestSnapPoint(point, 5);
        if (snapped) point = snapped;
        
        metroPoints.push(point);
        if (metroPoints.length === 2) {
            addMetroMeasure(metroPoints[0], metroPoints[1]);
            metroPoints = [];
            removeMetroPreview();
        }
    }
}

function onMetroPointerMove(event) {
    if (!metroActive || metroPoints.length !== 1) return;
    
    const raycaster = new THREE.Raycaster();
    let p2 = getPointFromMouseEvent(event, raycaster);
    
    if (p2) {
        const snapped = getClosestSnapPoint(p2, 5);
        if (snapped) p2 = snapped;
        drawMetroPreview(metroPoints[0], p2);
    }
}

// Dibujar línea de medición temporal
function drawMetroPreview(p1, p2) {
    removeMetroPreview();
    
    // Crear línea de cota con offset perpendicular
    const dir = new THREE.Vector3().subVectors(p2, p1).normalize();
    const perp = new THREE.Vector3(-dir.z, 0, dir.x).normalize().multiplyScalar(5);
    const cotaP1 = p1.clone().add(perp);
    const cotaP2 = p2.clone().add(perp);

    // Crear geometría y material para la línea principal
    const cotaGeometry = new THREE.BufferGeometry().setFromPoints([cotaP1, cotaP2]);
    const cotaMaterial = new THREE.LineBasicMaterial({ color: 0x8888ff, linewidth: 1 });
    const line = new THREE.Line(cotaGeometry, cotaMaterial);
    scene.add(line);

    // Crear líneas auxiliares (punteadas)
    const auxMaterial = new THREE.LineDashedMaterial({ color: 0xcccccc, dashSize: 2, gapSize: 2 });
    
    const aux1 = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([p1, cotaP1]),
        auxMaterial.clone()
    );
    
    const aux2 = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([p2, cotaP2]), 
        auxMaterial.clone()
    );
    
    scene.add(aux1);
    scene.add(aux2);
    line.auxLines = [aux1, aux2];

    // Crear etiqueta con la distancia
    const mid = cotaP1.clone().add(cotaP2).multiplyScalar(0.5);
    const distance = p1.distanceTo(p2);
    const label = createMeasureLabel(mid, distance);
    
    metroPreview = { line };
    metroPreviewLabel = label;
}

// Agregar medición definitiva
function addMetroMeasure(p1, p2) {
    // Crear línea de cota con offset perpendicular
    const dir = new THREE.Vector3().subVectors(p2, p1).normalize();
    const perp = new THREE.Vector3(-dir.z, 0, dir.x).normalize().multiplyScalar(5);
    const cotaP1 = p1.clone().add(perp);
    const cotaP2 = p2.clone().add(perp);

    // Crear geometría y material para la línea principal (dorada)
    const cotaGeometry = new THREE.BufferGeometry().setFromPoints([cotaP1, cotaP2]);
    const cotaMaterial = new THREE.LineBasicMaterial({ color: 0xffd700, linewidth: 2 });
    const line = new THREE.Line(cotaGeometry, cotaMaterial);
    scene.add(line);

    // Crear líneas auxiliares (blancas punteadas)
    const auxMaterial = new THREE.LineDashedMaterial({ color: 0xffffff, dashSize: 2, gapSize: 2 });
    
    const aux1 = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([p1, cotaP1]),
        auxMaterial.clone()
    );
    
    const aux2 = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([p2, cotaP2]), 
        auxMaterial.clone()
    );
    
    scene.add(aux1);
    scene.add(aux2);
    line.auxLines = [aux1, aux2];

    // Crear etiqueta con la distancia
    const mid = cotaP1.clone().add(cotaP2).multiplyScalar(0.5);
    const distance = p1.distanceTo(p2);
    const label = createMeasureLabel(mid, distance);
    
    // Evento para editar medida
    label.addEventListener("keydown", function(e) {
        if (e.key === "Enter") {
            let val = label.value.replace(",", ".").toLowerCase().replace(/\s+/g, "");
            let newDist;
            
            if (val.endsWith("mm")) {
                newDist = parseFloat(val.replace("mm", ""));
            } else if (val.endsWith("m")) {
                newDist = parseFloat(val.replace("cm", "")) * 100;
            } else {
                newDist = parseFloat(val);
            }
            
            if (isNaN(newDist) || newDist <= 0) {
                showToast("Medida inválida");
                return;
            }
            
            const dir = new THREE.Vector3().subVectors(p2, p1).normalize();
            const newP2 = p1.clone().add(dir.multiplyScalar(newDist / 100));
            removeSingleMeasure(line, label);
            addMetroMeasure(p1, newP2);

            // Deseleccionar objetos
            selectedObject = null;
            selectedObjects = [];
            transformControls.detach();
            updateRotationDisplay();
        }
    });

    // Doble clic para eliminar
    label.ondblclick = function() {
        removeSingleMeasure(line, label);
    };

    metroMeasures.push({ line, label });
}

// Eliminar una medición
function removeSingleMeasure(line, label) {
    scene.remove(line);
    if (line.auxLines) {
        line.auxLines.forEach(aux => {
            scene.remove(aux);
            aux.geometry.dispose();
            aux.material.dispose();
        });
    }
    line.geometry.dispose();
    line.material.dispose();
    
    if (label && label.parentNode) {
        label.parentNode.removeChild(label);
    }
    
    metroMeasures = metroMeasures.filter(m => m.line !== line);
}

// Cancelar medición con ESC
function onMetroKeyDown(event) {
    if (event.key === "Escape") {
        metroActive = false;
        metroPoints = [];
        removeMetroPreview();
        renderer.domElement.style.cursor = "";
        renderer.domElement.removeEventListener("pointerdown", onMetroPointerDown);
        renderer.domElement.removeEventListener("pointermove", onMetroPointerMove);
        window.removeEventListener("keydown", onMetroKeyDown);
    }
}

// =======================
// MODO CREACIÓN DE RECTÁNGULO
// =======================
let rectangleModeActive = false;
let rectanglePoints = [];
let rectanglePreview = null;

document.getElementById("rectangleModeButton").addEventListener("click", enableRectangleMode);

// Helper para obtener punto en plano desde evento de mouse
function getPlanePointFromMouseEvent(event) {
    const rect = renderer.domElement.getBoundingClientRect();
    const clientX = event.touches && event.touches.length ? event.touches[0].clientX : event.clientX;
    const clientY = event.touches && event.touches.length ? event.touches[0].clientY : event.clientY;
    
    const mouse = new THREE.Vector2(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1
    );
    
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, camera);

    // Intersectar con plano XZ (y=0)
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const point = new THREE.Vector3();
    
    if (raycaster.ray.intersectPlane(plane, point)) {
        return point;
    }
    
    return null;
}

function enableRectangleMode() {
    rectangleModeActive = true;
    rectanglePoints = [];
    removeRectanglePreview();
    renderer.domElement.style.cursor = "crosshair";
    showToast("Haz clic en dos puntos para crear un rectángulo. ESC para cancelar.");
    
    renderer.domElement.addEventListener("pointerdown", onRectanglePointerDown, false);
    renderer.domElement.addEventListener("pointermove", onRectanglePointerMove, false);
    window.addEventListener("keydown", onRectangleKeyDown, false);
}

function onRectanglePointerDown(event) {
    if (!rectangleModeActive) return;
    
    const point = getPlanePointFromMouseEvent(event);
    if (point) {
        rectanglePoints.push(point);
        if (rectanglePoints.length === 2) {
            createRectangleFromPoints(rectanglePoints[0], rectanglePoints[1]);
            disableRectangleMode();
        }
    }
}

function onRectanglePointerMove(event) {
    if (!rectangleModeActive || rectanglePoints.length !== 1) return;
    
    const point = getPlanePointFromMouseEvent(event);
    if (point) {
        drawRectanglePreview(rectanglePoints[0], point);
    }
}

function onRectangleKeyDown(event) {
    if (event.key === "Escape") {
        disableRectangleMode();
    }
}

function createRectangleFromPoints(p1, p2) {
    removeRectanglePreview();
    
    // Calcular dimensiones
    const width = Math.abs(p2.x - p1.x);
    const depth = Math.abs(p2.z - p1.z);
    const height = parseFloat(prompt("Altura del rectángulo (cm):", "10")) || 10;
    
    // Validar dimensiones mínimas
    if (width < 0.1 || height < 0.1 || depth < 0.1) {
        showToast("El rectángulo es demasiado pequeño.");
        saveState();
        return;
    }
    
    // Calcular centro
    const center = new THREE.Vector3(
        (p1.x + p2.x) / 2,
        height / 2,
        (p1.z + p2.z) / 2
    );
    
    // Crear geometría, material y mesh
    const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(width, height, depth),
        new THREE.MeshStandardMaterial({ color: 0x808080 })
    );
      mesh.position.copy(center);
    mesh.userData.name = "Rectángulo";
    
    // Se han eliminado los bordes blancos
    
    scene.add(mesh);
    
    // Limpiar selección
    selectedObject = null;
    selectedObjects = [];
    transformControls.detach();
    
    // Guardar estado y mostrar mensaje
    saveState();
    showToast("Rectángulo creado");
    
    // Reset selección (evita bugs de selección)
    setTimeout(() => {
        selectedObject = null;
        selectedObjects = [];
        transformControls.detach();
        updateRotationDisplay();
    }, 50);
}

function disableRectangleMode() {
    rectangleModeActive = false;
    rectanglePoints = [];
    removeRectanglePreview();
    renderer.domElement.style.cursor = "";
    
    renderer.domElement.removeEventListener("pointerdown", onRectanglePointerDown);
    renderer.domElement.removeEventListener("pointermove", onRectanglePointerMove);
    window.removeEventListener("keydown", onRectangleKeyDown);
    
    saveState();
}

function drawRectanglePreview(p1, p2) {
    removeRectanglePreview();
    
    // Calcular dimensiones
    const width = Math.abs(p2.x - p1.x);
    const depth = Math.abs(p2.z - p1.z);
    const height = parseFloat(document.getElementById("height")?.value) || 10;
    
    if (width < 0.01 || depth < 0.01) return;
    
    // Calcular centro
    const center = new THREE.Vector3(
        (p1.x + p2.x) / 2,
        height / 2,
        (p1.z + p2.z) / 2
    );
      // Crear mesh semitransparente para preview
    const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(width, height, depth),
        new THREE.MeshBasicMaterial({ 
            color: 0x00ffcc, 
            opacity: 0.3, 
            transparent: true 
        })
    );
    
    // Se han eliminado los bordes
    
    mesh.position.copy(center);
    rectanglePreview = mesh;
    scene.add(mesh);
}

function removeRectanglePreview() {
    if (rectanglePreview) {
        // Eliminar mesh, bordes y liberar memoria
        scene.remove(rectanglePreview);
        
        if (rectanglePreview.children.length) {
            rectanglePreview.children.forEach(child => {
                if (child.geometry) child.geometry.dispose();
                if (child.material) child.material.dispose();
            });
        }
        
        rectanglePreview.geometry.dispose();
        if (rectanglePreview.material) rectanglePreview.material.dispose();
        rectanglePreview = null;
    }
}

// =======================
// FUNCIONES DE SNAPPING
// =======================

// Función auxiliar para generar puntos de snap de un objeto
function generateObjectSnapPoints(obj, bbox) {
    if (!bbox) {
        obj.geometry.computeBoundingBox();
        bbox = obj.geometry.boundingBox;
    }
    
    const min = bbox.min, max = bbox.max;
    const snapPoints = [];
    
    // Punto central para cálculos
    const midX = (min.x + max.x) / 2;
    const midY = (min.y + max.y) / 2;
    const midZ = (min.z + max.z) / 2;
    
    // 1. Añadir los 8 vértices (esquinas)
    [
        [min.x, min.y, min.z], [min.x, min.y, max.z], 
        [min.x, max.y, min.z], [min.x, max.y, max.z],
        [max.x, min.y, min.z], [max.x, min.y, max.z], 
        [max.x, max.y, min.z], [max.x, max.y, max.z]
    ].forEach(([x, y, z]) => snapPoints.push(new THREE.Vector3(x, y, z)));
    
    // 2. Añadir los centros de las 6 caras
    [
        [midX, min.y, midZ], [midX, max.y, midZ], // Caras Y
        [min.x, midY, midZ], [max.x, midY, midZ], // Caras X
        [midX, midY, min.z], [midX, midY, max.z]  // Caras Z
    ].forEach(([x, y, z]) => snapPoints.push(new THREE.Vector3(x, y, z)));
    
    // 3. Añadir el centro del objeto
    snapPoints.push(new THREE.Vector3(midX, midY, midZ));
    
    // 4. Añadir puntos medios de aristas
    // Puntos medios de las aristas X
    for (let y of [min.y, max.y]) {
        for (let z of [min.z, max.z]) {
            snapPoints.push(new THREE.Vector3((min.x + max.x) / 2, y, z));
        }
    }
    
    // Puntos medios de las aristas Y
    for (let x of [min.x, max.x]) {
        for (let z of [min.z, max.z]) {
            snapPoints.push(new THREE.Vector3(x, (min.y + max.y) / 2, z));
        }
    }
    
    // Puntos medios de las aristas Z
    for (let x of [min.x, max.x]) {
        for (let y of [min.y, max.y]) {
            snapPoints.push(new THREE.Vector3(x, y, (min.z + max.z) / 2));
        }
    }
    
    // Transformar todos los puntos al espacio mundial
    return snapPoints.map(v => v.clone().applyMatrix4(obj.matrixWorld));
}

// Función optimizada para snap por esquinas
function snapToClosestCorner(obj) {
    if (!obj || !obj.geometry) return;
    
    const SNAP_TOLERANCE = 2; // unidades de escena
    
    // Obtener los vértices del objeto a mover
    obj.geometry.computeBoundingBox();
    const vertices = generateObjectSnapPoints(obj, obj.geometry.boundingBox).slice(0, 8); // Solo esquinas
    
    let closest = null;
    let minDist = Infinity;
    
    // Filtrar objetos de la escena (solo otros meshes)
    const otherObjects = scene.children.filter(other => 
        other !== obj && other.isMesh && other.geometry
    );
    
    // Encontrar el par de vértices más cercano
    for (const other of otherObjects) {
        other.geometry.computeBoundingBox();
        const otherVertices = generateObjectSnapPoints(other, other.geometry.boundingBox).slice(0, 8);
        
        for (const v1 of vertices) {
            for (const v2 of otherVertices) {
                const dist = v1.distanceTo(v2);
                if (dist < minDist && dist < SNAP_TOLERANCE) {
                    minDist = dist;
                    closest = { v1, v2 };
                }
            }
        }
    }
    
    // Si encontramos un par cercano, ajustar posición
    if (closest) {
        const offset = new THREE.Vector3().subVectors(closest.v2, closest.v1);
        obj.position.add(offset);
    }
}

// Función optimizada de snapping a múltiples puntos
function snapToClosestSnapPoint(obj) {
    if (!obj || !obj.geometry) return;
    
    const SNAP_TOLERANCE = 2.5; // unidades de escena
    
    // Obtener puntos de snap del objeto (todos los puntos)
    obj.geometry.computeBoundingBox();
    const snapPoints = generateObjectSnapPoints(obj, obj.geometry.boundingBox);
    
    let closest = null;
    let minDist = Infinity;
    
    // Filtrar objetos de la escena (solo otros meshes)
    const otherObjects = scene.children.filter(other => 
        other !== obj && other.isMesh && other.geometry
    );
    
    // Buscar el par de puntos más cercano entre todos los disponibles
    for (const other of otherObjects) {
        other.geometry.computeBoundingBox();
        const otherSnapPoints = generateObjectSnapPoints(other, other.geometry.boundingBox);
        
        for (const v1 of snapPoints) {
            for (const v2 of otherSnapPoints) {
                const dist = v1.distanceTo(v2);
                if (dist < minDist && dist < SNAP_TOLERANCE) {
                    minDist = dist;
                    closest = { v1, v2 };
                    
                    // Optimización: si encontramos una coincidencia exacta, salimos temprano
                    if (dist < 0.001) {
                        break;
                    }
                }
            }
        }
    }
    
    // Si encontramos un par cercano, ajustar posición
    if (closest) {
        const offset = new THREE.Vector3().subVectors(closest.v2, closest.v1);
        obj.position.add(offset);
        obj.updateMatrixWorld();
    }
}
// ==========================================
// MODO PUSH/PULL (EMPUJAR/TIRAR)
// ==========================================

let pushPullModeActive = false;
let pushPullTarget = null;
let pushPullFaceIndex = null;
let pushPullOriginal = null;

// Configurar eventos para los botones
document.getElementById("pushPullModeBtn").addEventListener("click", enablePushPullMode);
document.getElementById("applyPushPullBtn").addEventListener("click", applyPushPull);
document.getElementById("cancelPushPullBtn").addEventListener("click", disablePushPullMode);

/**
 * Activa el modo Push/Pull para modificar dimensiones de objetos
 */
function enablePushPullMode() {
    pushPullModeActive = true;
    pushPullTarget = null;
    pushPullFaceIndex = null;
    pushPullOriginal = null;
    
    // Mostrar panel de control y cambiar cursor
    document.getElementById("pushPullPanel").style.display = "block";
    document.getElementById("pushPullInfo").innerText = "Haz clic en una cara de un cubo para modificar su medida.";
    renderer.domElement.style.cursor = "crosshair";
    
    // Registrar evento de clic
    renderer.domElement.addEventListener("pointerdown", onPushPullPointerDown, false);
}

/**
 * Desactiva el modo Push/Pull
 */
function disablePushPullMode() {
    pushPullModeActive = false;
    pushPullTarget = null;
    pushPullFaceIndex = null;
    pushPullOriginal = null;
    
    // Ocultar panel y restaurar cursor
    document.getElementById("pushPullPanel").style.display = "none";
    renderer.domElement.style.cursor = "";
    
    // Quitar evento de clic
    renderer.domElement.removeEventListener("pointerdown", onPushPullPointerDown);
}

/**
 * Maneja el evento de selección de cara para Push/Pull
 */
function onPushPullPointerDown(event) {
    if (!pushPullModeActive) return;
    
    // Obtener coordenadas del clic
    const rect = renderer.domElement.getBoundingClientRect();
    const clientX = event.touches && event.touches.length ? event.touches[0].clientX : event.clientX;
    const clientY = event.touches && event.touches.length ? event.touches[0].clientY : event.clientY;
    
    // Convertir a coordenadas normalizadas para el raycaster
    const mouse = new THREE.Vector2(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1
    );
    
    // Configurar raycaster
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, camera);

    // Solo detectar cubos
    const cubes = scene.children.filter(obj => 
        obj.isMesh && obj.geometry && obj.geometry.type === "BoxGeometry"
    );
    
    const intersects = raycaster.intersectObjects(cubes, false);
    if (intersects.length > 0) {
        // Guardar objeto seleccionado y cara
        pushPullTarget = intersects[0].object;
        pushPullFaceIndex = intersects[0].faceIndex;
        
        // Guardar dimensiones originales
        pushPullOriginal = {
            width: pushPullTarget.geometry.parameters.width,
            height: pushPullTarget.geometry.parameters.height,
            depth: pushPullTarget.geometry.parameters.depth,
            position: pushPullTarget.position.clone()
        };

        // Determinar eje y dirección de la cara seleccionada
        const face = intersects[0].face;
        let axis, sign, currentValue;
        
        // Determinar qué eje es perpendicular a la cara
        if (Math.abs(face.normal.x) > 0.9) {
            axis = "x";
            sign = Math.sign(face.normal.x);
            currentValue = pushPullOriginal.width;
        } else if (Math.abs(face.normal.y) > 0.9) {
            axis = "y";
            sign = Math.sign(face.normal.y);
            currentValue = pushPullOriginal.height;
        } else {
            axis = "z";
            sign = Math.sign(face.normal.z);
            currentValue = pushPullOriginal.depth;
        }
        
        // Guardar datos para aplicar
        pushPullTarget._pushPullAxis = axis;
        pushPullTarget._pushPullSign = sign;

        // Actualizar interfaz
        document.getElementById("pushPullValue").value = currentValue;
        document.getElementById("pushPullInfo").innerText = 
            `Cara seleccionada: ${axis.toUpperCase()} (${sign > 0 ? "+" : "-"})`;
    }
}

/**
 * Aplica la nueva dimensión al objeto seleccionado
 */
function applyPushPull() {
    if (!pushPullTarget || pushPullFaceIndex === null) return;
    
    // Validar el nuevo valor
    const newValue = parseFloat(document.getElementById("pushPullValue").value);
    if (isNaN(newValue) || newValue <= 0) {
        showToast("Medida inválida");
        return;
    }

    // Obtener datos guardados
    const axis = pushPullTarget._pushPullAxis;
    const sign = pushPullTarget._pushPullSign;

    // Dimensiones actuales
    let { width, height, depth } = pushPullTarget.geometry.parameters;
    const pos = pushPullTarget.position.clone();

    // Actualizar dimensión según el eje
    if (axis === "x") {
        const delta = newValue - width;
        pos.x += (delta / 2) * sign;
        width = newValue;
    } else if (axis === "y") {
        const delta = newValue - height;
        pos.y += (delta / 2) * sign;
        height = newValue;
    } else if (axis === "z") {
        const delta = newValue - depth;
        pos.z += (delta / 2) * sign;
        depth = newValue;
    }

    // Reemplazar geometría y actualizar posición
    pushPullTarget.geometry.dispose();
    pushPullTarget.geometry = new THREE.BoxGeometry(width, height, depth);
    pushPullTarget.position.copy(pos);

    // Actualizar los bordes
    if (pushPullTarget.children.length > 0) {
        const oldEdges = pushPullTarget.children[0];
        if (oldEdges.geometry) oldEdges.geometry.dispose();
        if (oldEdges.material) oldEdges.material.dispose();
        pushPullTarget.remove(oldEdges);
    }
      // Se han eliminado los bordes blancos

    // Guardar estado y mostrar confirmación
    saveState();
    showToast("Medida modificada");
    disablePushPullMode();
}

// Opcional: ESC para cancelar
window.addEventListener("keydown", function (e) {
    if (pushPullModeActive && e.key === "Escape") {
        disablePushPullMode();
    }
});

// Desactiva el movimiento de la cámara cuando Ctrl está presionado
window.addEventListener("keydown", function (e) {
    if (e.key === "Control" && controls) {
        controls.enabled = false;
    }
});
window.addEventListener("keyup", function (e) {
    if (e.key === "Control" && controls) {
        controls.enabled = true;
    }
});

let ctrlPressed = false;

window.addEventListener("keydown", function (e) {
    if (e.key === "Control" || e.key === "Ctrl") ctrlPressed = true;
});
window.addEventListener("keyup", function (e) {
    if (e.key === "Control" || e.key === "Ctrl") ctrlPressed = false;
});

function onDeselect(event) {
    const menu = document.getElementById("menu");
    if (menu.contains(event.target)) return;
    event.preventDefault();
    // Limpia selección múltiple visual
    const meshes = scene.children.filter(obj => obj.isMesh && obj.type === "Mesh");
    meshes.forEach(obj => {
        if (obj.children.length > 0 && obj.children[0].material) {
            obj.children[0].material.color.set(0xffffff);
        }
        if (obj.material) obj.material.color.set(0x808080);
    });
    selectedObject = null;
    selectedObjects = [];
    transformControls.detach();
    updateRotationDisplay();
}

// CONFIGURAR EVENT LISTENERS PARA POBLAR SELECT DE MODELOS
// La función populateModelSelect está definida en js.js
window.addEventListener('DOMContentLoaded', function() {
    if (typeof populateModelSelect === 'function') {
        populateModelSelect();
    }
});

// También intentamos ejecutar después de que todos los scripts estén cargados
window.addEventListener('load', function() {
    if (document.getElementById('modelSelect') && document.getElementById('modelSelect').children.length === 0) {
        if (typeof populateModelSelect === 'function') {
            populateModelSelect();
        }
    }
});

function centerGroupOnObjects(group, objects) {
    if (objects.length === 0) return;

    // Calcular el centro geométrico real usando bounding boxes
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    
    objects.forEach(obj => {
        // Usar bounding box si existe
        if (obj.geometry) {
            // Asegurarse de que la bounding box está actualizada
            obj.geometry.computeBoundingBox();
            const bbox = obj.geometry.boundingBox;
            
            // Convertir las coordenadas del bbox al espacio mundial
            const worldMinVec = new THREE.Vector3(bbox.min.x, bbox.min.y, bbox.min.z);
            const worldMaxVec = new THREE.Vector3(bbox.max.x, bbox.max.y, bbox.max.z);
            
            worldMinVec.applyMatrix4(obj.matrixWorld);
            worldMaxVec.applyMatrix4(obj.matrixWorld);
            
            minX = Math.min(minX, worldMinVec.x);
            minY = Math.min(minY, worldMinVec.y);
            minZ = Math.min(minZ, worldMinVec.z);
            
            maxX = Math.max(maxX, worldMaxVec.x);
            maxY = Math.max(maxY, worldMaxVec.y);
            maxZ = Math.max(maxZ, worldMaxVec.z);
        } else {
            // Si no hay geometría, usar la posición del objeto
            minX = Math.min(minX, obj.position.x);
            minY = Math.min(minY, obj.position.y);
            minZ = Math.min(minZ, obj.position.z);
            
            maxX = Math.max(maxX, obj.position.x);
            maxY = Math.max(maxY, obj.position.y);
            maxZ = Math.max(maxZ, obj.position.z);
        }
    });
    
    // Calcular el centro real
    const geometricCenter = new THREE.Vector3(
        (minX + maxX) / 2,
        (minY + maxY) / 2,
        (minZ + maxZ) / 2
    );

    // Posicionar el grupo en el centro geométrico real
    group.position.copy(geometricCenter);

    // Ajustar la posición de los hijos para mantener su posición global
    objects.forEach(obj => {
        // Guardar la posición mundial original
        const worldPosition = new THREE.Vector3();
        obj.getWorldPosition(worldPosition);
        
        // Añadir al grupo
        group.add(obj);
        
        // Calcular la diferencia entre la posición mundial antes y después de añadirlo al grupo
        const newWorldPosition = new THREE.Vector3();
        obj.getWorldPosition(newWorldPosition);
        
        // Ajustar la posición local para mantener la posición mundial original
        const worldDiff = new THREE.Vector3().subVectors(worldPosition, newWorldPosition);
        obj.position.add(worldDiff);
    });
}