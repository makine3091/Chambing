// =======================
// GESTIÓN DE FONDO
// =======================

// Función para cargar un Skybox desde una sola imagen
function setSkyboxFromSingleImage(imagePath) {
    if (!imagePath) {
        showToast("Por favor proporciona una imagen válida para el Skybox.");
        return;
    }

    const loader = new THREE.TextureLoader();
    loader.load(imagePath, function (texture) {
        const skyboxMaterial = new THREE.MeshBasicMaterial({
            map: texture,
            side: THREE.BackSide // Renderiza el material desde el interior
        });

        const skyboxGeometry = new THREE.SphereGeometry(500, 60, 40); // Geometría de esfera para el Skybox
        const skyboxMesh = new THREE.Mesh(skyboxGeometry, skyboxMaterial);

        scene.add(skyboxMesh);
        showToast("Skybox establecido correctamente.");
    }, undefined, function () {
        showToast("Error al cargar la imagen del Skybox.");
    });
}

// Función para cargar un Skybox desde una imagen HDR o EXR
function setSkyboxFromHDR(file) {
    if (!file || !(file.name.endsWith('.hdr') || file.name.endsWith('.exr'))) {
        showToast("Por favor selecciona un archivo HDR o EXR válido.");
        return;
    }

    const loader = file.name.endsWith('.hdr') ? new THREE.RGBELoader() : new THREE.EXRLoader();
    const reader = new FileReader();

    reader.onload = function (event) {
        loader.load(event.target.result, function (texture) {
            texture.mapping = THREE.EquirectangularReflectionMapping; // Mapeo para Skybox
            scene.background = texture; // Establecer como fondo de la escena
            showToast("Skybox HDR/EXR establecido correctamente.");
        }, undefined, function () {
            showToast("Error al cargar la imagen HDR/EXR.");
        });
    };

    reader.onerror = function () {
        showToast("Error al leer el archivo de imagen.");
    };

    reader.readAsDataURL(file);
}

// Event listener para el botón de cargar Skybox
document.addEventListener("DOMContentLoaded", function () {
    const skyboxButton = document.getElementById("skyboxButton");
    const skyboxInput = document.getElementById("skyboxInput");

    if (!skyboxButton || !skyboxInput) {
        console.error("Elementos HTML para el Skybox no encontrados.");
        return;
    }

    skyboxButton.addEventListener("click", function () {
        const input = document.getElementById("skyboxInput");
        const file = input.files[0];
        if (!file) {
            showToast("Por favor selecciona un archivo válido.");
            return;
        }

        const fileExtension = file.name.split('.').pop().toLowerCase();
        const url = URL.createObjectURL(file); // Crear una URL temporal para el archivo

        let loader;
        if (fileExtension === 'hdr') {
            loader = new THREE.RGBELoader();
        } else if (fileExtension === 'exr') {
            loader = new THREE.EXRLoader();
        } else if (['jpg', 'jpeg', 'png'].includes(fileExtension)) {
            loader = new THREE.TextureLoader();
        } else {
            showToast("Formato no soportado. Usa HDR, EXR, JPG o PNG.");
            return;
        }

        loader.load(url, function (texture) {
            texture.mapping = THREE.EquirectangularReflectionMapping;
            scene.background = texture;
            URL.revokeObjectURL(url); // Liberar la URL temporal
            showToast(`Skybox ${fileExtension.toUpperCase()} establecido correctamente.`);
        }, undefined, function () {
            showToast(`Error al cargar la imagen ${fileExtension.toUpperCase()}.`);
        });
    });
});
