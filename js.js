// =======================
// VARIABLES GLOBALES
// =======================
let scene, camera, renderer, controls, transformControls;
let selectedObject = null;
let copiedObjects = [];
let isDragging = false;
let isDragSelecting = false;
let selectedObjects = [];
let multiSelectGroup = null;
let history = [];
let redoStack = [];
const textureLoader = new THREE.TextureLoader();

// Función optimizada para exponer variables globales a otros archivos
function exposeGlobalVariables() {
    // Asignar variables esenciales al objeto global window
    window.scene = scene;
    window.camera = camera;
    window.renderer = renderer;
    window.controls = controls;
    window.transformControls = transformControls;
    window.selectedObject = selectedObject;
    window.copiedObjects = copiedObjects;
    window.selectedObjects = selectedObjects;
    window.multiSelectGroup = multiSelectGroup;
    window.history = history;
    window.redoStack = redoStack;
    window.textureLoader = textureLoader;
    window.saveState = saveState;
    window.showToast = showToast;
    window.deleteSelected = deleteSelected;
}

// Optimización: Funciones para copiar/pegar objetos
document.addEventListener("keydown", function (event) {
    // Copiar (Ctrl+C)
    if (event.ctrlKey && event.key.toLowerCase() === "c") {
        copySelectedObjects();
    }
    // Pegar (Ctrl+V)
    if (event.ctrlKey && event.key.toLowerCase() === "v") {
        pasteObjects();
    }
});

// Función optimizada para copiar objetos seleccionados
function copySelectedObjects() {
    copiedObjects = [];

    // No hay selección
    if ((!selectedObjects || selectedObjects.length === 0) && !selectedObject) {
        showToast("Selecciona una o varias piezas para copiar");
        return;
    }

    // Función auxiliar para extraer datos de objeto
    const extractObjectData = (obj) => ({
        geometryParams: obj.geometry?.parameters || {},
        geometryType: obj.geometry?.type || "BoxGeometry",
        materialParams: {
            color: obj.material?.color?.getHex() || 0x808080,
            map: obj.material?.map ? obj.material.map.image?.src || obj.material.map.source?.src : null
        }, scale: obj.scale.clone(),
        rotation: {
            x: obj.rotation.x,
            y: obj.rotation.y,
            z: obj.rotation.z,
            order: obj.rotation.order || 'XYZ'
        },
        position: obj.position.clone(),
        userData: Object.assign({}, obj.userData || {})
    });

    // Copiar múltiples objetos
    if (selectedObjects && selectedObjects.length > 1) {
        selectedObjects.forEach(obj => {
            if (obj.isMesh && obj.geometry) {
                copiedObjects.push(extractObjectData(obj));
            }
        });
        showToast("Piezas copiadas");
    }
    // Copiar un solo objeto
    else if (selectedObject) {
        copiedObjects.push(extractObjectData(selectedObject));
        showToast("Pieza copiada");
    }
}

// Función optimizada para pegar objetos
function pasteObjects() {
    if (!copiedObjects || copiedObjects.length === 0) {
        showToast("No hay piezas copiadas");
        return;
    }

    let newSelection = [];

    // Crear objetos a partir de dados copiados
    copiedObjects.forEach(copied => {
        // Crear geometría según tipo
        let geometry;
        switch (copied.geometryType) {
            case "BoxGeometry":
                geometry = new THREE.BoxGeometry(
                    copied.geometryParams.width || 5,
                    copied.geometryParams.height || 5,
                    copied.geometryParams.depth || 5
                );
                break;
            case "SphereGeometry":
                geometry = new THREE.SphereGeometry(
                    copied.geometryParams.radius || 5,
                    32, 32
                );
                break;
            case "CylinderGeometry":
                geometry = new THREE.CylinderGeometry(
                    copied.geometryParams.radiusTop || 5,
                    copied.geometryParams.radiusBottom || 5,
                    copied.geometryParams.height || 10,
                    32
                );
                break;
            default:
                geometry = new THREE.BoxGeometry(5, 5, 5);
        }

        // Crear material
        const material = new THREE.MeshStandardMaterial({
            color: copied.materialParams.color
        });

        // Aplicar textura si existe
        if (copied.materialParams.map) {
            material.map = textureLoader.load(copied.materialParams.map);
        }        // Crear mesh y configurar propiedades
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.copy(copied.position).add(new THREE.Vector3(10, 0, 10));
        // Asegurar orden correcto para evitar error con quaternions
        mesh.rotation.order = 'XYZ';
        mesh.rotation.set(copied.rotation.x, copied.rotation.y, copied.rotation.z);
        mesh.scale.copy(copied.scale);
        mesh.userData = Object.assign({}, copied.userData);

        // Se han eliminado los bordes blancos

        scene.add(mesh);
        newSelection.push(mesh);
    });

    // Gestionar selección de objetos pegados
    handleSelectionAfterPaste(newSelection);
}

// Gestionar selección después de pegar
function handleSelectionAfterPaste(newSelection) {
    if (newSelection.length > 1) {
        selectedObjects = newSelection;

        // Limpiar grupo multi-selección existente
        if (multiSelectGroup && multiSelectGroup.children.length > 0) {
            const children = [...multiSelectGroup.children];
            children.forEach(obj => {
                const worldPos = obj.getWorldPosition(new THREE.Vector3());
                scene.add(obj);
                obj.position.copy(worldPos);
            });
            scene.remove(multiSelectGroup);
        }

        // Crear nuevo grupo y centrar
        multiSelectGroup = new THREE.Group();
        centerGroupOnObjects(multiSelectGroup, selectedObjects);
        scene.add(multiSelectGroup);

        // Actualizar selección
        selectedObject = multiSelectGroup;
        transformControls.attach(multiSelectGroup);
        transformControls.setMode("translate");
    } else if (newSelection.length === 1) {
        selectedObject = newSelection[0];
        selectedObjects = [selectedObject];
        transformControls.attach(selectedObject);
        transformControls.setMode("translate");
    }

    saveState();
    showToast("Pieza(s) pegada(s)");
}
// Función optimizada para mostrar mensajes breves
function showToast(msg) {
    const toast = document.getElementById("toast");
    if (!toast) {
        console.warn("Elemento toast no encontrado");
        console.info(msg);
        return;
    }
    // Cancelar cualquier timer previo
    if (toast._timeoutId) clearTimeout(toast._timeoutId);

    toast.innerText = msg;
    toast.style.display = "block";
    toast._timeoutId = setTimeout(() => { toast.style.display = "none"; }, 1500);
}

// Gestor centralizado de texturas
let textures = {
    custom: null,
    cache: new Map() // Cache para evitar cargar múltiples veces la misma textura
};

const providerTextures = {
    duratex: [
        {
            group: "Maderas", textures: [
                { key: "maderas/amaretto", name: "Amaretto", file: "textures/duratex/maderas/amaretto.jpg" },
                { key: "maderas/arena", name: "Arena", file: "textures/duratex/maderas/arena.jpg" },
                { key: "maderas/austral", name: "Austral", file: "textures/duratex/maderas/austral.jpg" },
                { key: "maderas/bahia", name: "Bahia", file: "textures/duratex/maderas/bahia.jpg" },
                { key: "maderas/bosco", name: "Bosco", file: "textures/duratex/maderas/bosco.jpg" },
                { key: "maderas/cala", name: "Cala", file: "textures/duratex/maderas/cala.jpg" },
                { key: "maderas/capuccino", name: "Capuccino", file: "textures/duratex/maderas/capuccino.jpg" },
                { key: "maderas/cedro", name: "Cedro", file: "textures/duratex/maderas/cedro.jpg" },
                { key: "maderas/chantilli", name: "Chantilli", file: "textures/duratex/maderas/chantilli.jpg" },
                { key: "maderas/glacial", name: "Glacial", file: "textures/duratex/maderas/glacial.jpg" },
                { key: "maderas/gracia", name: "Gracia", file: "textures/duratex/maderas/gracia.jpg" },
                { key: "maderas/humo", name: "Humo", file: "textures/duratex/maderas/humo.jpg" },
                { key: "maderas/kallio", name: "Kallio", file: "textures/duratex/maderas/kallio.jpg" },
                { key: "maderas/koa", name: "Koa", file: "textures/duratex/maderas/koa.jpg" },
                { key: "maderas/macula", name: "Macula", file: "textures/duratex/maderas/macula.jpg" },
                { key: "maderas/mitte", name: "Mitte", file: "textures/duratex/maderas/mitte.jpg" },
                { key: "maderas/nuez", name: "Nuez", file: "textures/duratex/maderas/nuez.jpg" },
                { key: "maderas/oasis", name: "Oasis", file: "textures/duratex/maderas/oasis.jpg" },
                { key: "maderas/rivera", name: "Rivera", file: "textures/duratex/maderas/rivera.jpg" },
                { key: "maderas/sagano", name: "Sagano", file: "textures/duratex/maderas/sagano.jpg" },
                { key: "maderas/soder", name: "Soder", file: "textures/duratex/maderas/soder.jpg" },
                { key: "maderas/tabaco chic", name: "Tabaco Chic", file: "textures/duratex/maderas/tabaco chic.jpg" },
                { key: "maderas/terranta", name: "Terranta", file: "textures/duratex/maderas/terranta.jpg" },
                { key: "maderas/traviata", name: "Traviata", file: "textures/duratex/maderas/traviata.jpg" },
                { key: "maderas/vienes", name: "Vienes", file: "textures/duratex/maderas/vienes.jpg" },
                { key: "maderas/wengue", name: "Wengue", file: "textures/duratex/maderas/wengue.jpg" },
                { key: "maderas/wood", name: "Wood", file: "textures/duratex/maderas/wood.jpg" }
            ]
        },
        {
            group: "Piedras", textures: [
                { key: "piedras/agatha", name: "Agatha", file: "textures/duratex/piedras/agatha.jpg" },
                { key: "piedras/etna", name: "Etna", file: "textures/duratex/piedras/etna.jpg" },
                { key: "piedras/lunar", name: "Lunar", file: "textures/duratex/piedras/lunar.jpg" },
                { key: "piedras/marmoro", name: "Marmoro", file: "textures/duratex/piedras/marmoro.png" }
            ]
        },
        {
            group: "Tejidos", textures: [
                { key: "tejidos/tejidoslana", name: "Tejidos Lana", file: "textures/duratex/tejidos/tejidoslana.jpg" }
            ]
        },
        {
            group: "Unicolores", textures: [
                { key: "unicolores/ambar", name: "Ámbar", file: "textures/duratex/unicolores/ambar.jpg" },
                { key: "unicolores/auro", name: "Auro", file: "textures/duratex/unicolores/auro.jpg" },
                { key: "unicolores/blanco nevado", name: "Blanco Nevado", file: "textures/duratex/unicolores/blanco nevado.jpg" },
                { key: "unicolores/bohem", name: "Bohem", file: "textures/duratex/unicolores/bohem.jpg" }
            ]
        }
    ],

    arauco: [
        {
            group: "Maderas", textures: [
                { key: "maderas/awoura", name: "AWOURA", file: "textures/arauco/maderas/awoura.jpg" },
                { key: "maderas/bora", name: "BORA", file: "textures/arauco/maderas/bora.jpg" },
                { key: "maderas/caramel", name: "CARAMEL", file: "textures/arauco/maderas/caramel.jpg" },
                { key: "maderas/cedro natural", name: "CEDRO NATURAL", file: "textures/arauco/maderas/cedro natural.jpg" },
                { key: "maderas/cendra escandinavo", name: "CENDRA ESCANDINAVO", file: "textures/arauco/maderas/cendra escandinavo.jpg" },
                { key: "maderas/cocoa", name: "COCOA", file: "textures/arauco/maderas/cocoa.jpg" },
                { key: "maderas/espresso", name: "ESPRESSO", file: "textures/arauco/maderas/espresso.jpg" },
                { key: "maderas/jerez", name: "JEREZ", file: "textures/arauco/maderas/jerez.jpg" },
                { key: "maderas/nodo", name: "NODO", file: "textures/arauco/maderas/nodo.jpg" },
                { key: "maderas/nougat", name: "NOUGAT", file: "textures/arauco/maderas/nougat.jpg" },
                { key: "maderas/okuzai", name: "OKUZAI", file: "textures/arauco/maderas/okuzai.jpg" },
                { key: "maderas/roble cava", name: "ROBLE CAVA", file: "textures/arauco/maderas/roble cava.jpg" },
                { key: "maderas/roble provenzal", name: "ROBLE PROVENZAL", file: "textures/arauco/maderas/roble provenzal.jpg" },
                { key: "maderas/roble rustico", name: "ROBLE RUSTICO", file: "textures/arauco/maderas/roble rustico.jpg" },
                { key: "maderas/teka artico", name: "TEKA ARTICO", file: "textures/arauco/maderas/teka artico.jpg" },
                { key: "maderas/toffee", name: "TOFFEE", file: "textures/arauco/maderas/toffee.jpg" },
                { key: "maderas/toscana", name: "TOSCANA", file: "textures/arauco/maderas/toscana.jpg" },
                { key: "maderas/wengue", name: "WENGUE", file: "textures/arauco/maderas/wengue.jpg" }
            ]
        },
        {
            group: "Piedras", textures: [
                { key: "piedra/antaya", name: "ANTAYA", file: "textures/arauco/piedra/antaya.jpg" }
            ]
        },
        {
            group: "Tejidos", textures: [
                { key: "tejidos/seda giorno", name: "SEDA GIORNO", file: "textures/arauco/tejidos/seda giorno.jpg" },
                { key: "tejidos/seda notte", name: "SEDA NOTTE", file: "textures/arauco/tejidos/seda notte.jpg" }
            ]
        },
        {
            group: "Unicolor", textures: [
                { key: "unicolor/blanco nieve", name: "BLANCO NIEVE", file: "textures/arauco/unicolor/blanco nieve.jpg" },
                { key: "unicolor/negro mate", name: "NEGRO MATE", file: "textures/arauco/unicolor/negro mate.jpg" },
                { key: "unicolor/taupe", name: "TAUPE", file: "textures/arauco/unicolor/taupe.jpg" },
                { key: "unicolor/titanio", name: "TITANIO", file: "textures/arauco/unicolor/titanio.jpg" }
            ]
        }
    ],
    arkopa: [
        {
            group: "Maderas", textures: [
                { key: "arkopa/madera/imgi_18_2786-Mat-Lidya", name: "Mat Lidya", file: "textures/arkopa/madera/imgi_18_2786-Mat-Lidya.jpg" },
                { key: "arkopa/madera/imgi_19_2787-Mat-Frig", name: "Mat Frig", file: "textures/arkopa/madera/imgi_19_2787-Mat-Frig.jpg" },
                { key: "arkopa/madera/imgi_20_1044-Mat-Pelit", name: "Mat Pelit", file: "textures/arkopa/madera/imgi_20_1044-Mat-Pelit.jpg" },
                { key: "arkopa/madera/imgi_21_1047-Mat-Beyaz-Pelit", name: "Mat Beyaz Pelit", file: "textures/arkopa/madera/imgi_21_1047-Mat-Beyaz-Pelit.jpg" },
                { key: "arkopa/madera/imgi_32_934-Mat-Boyahabilir-Ahsap", name: "Mat Boyahabilir Ahsap", file: "textures/arkopa/madera/imgi_32_934-Mat-Boyahabilir-Ahsap.jpg" },
                { key: "arkopa/madera/imgi_33_1737-Mat-Ozigo", name: "Mat Ozigo", file: "textures/arkopa/madera/imgi_33_1737-Mat-Ozigo.jpg" },
                { key: "arkopa/madera/imgi_34_1687-Mat-Acik-Mese", name: "Mat Acik Mese", file: "textures/arkopa/madera/imgi_34_1687-Mat-Acik-Mese.jpg" },
                { key: "arkopa/madera/imgi_35_90-Mat-Ladin", name: "Mat Ladin", file: "textures/arkopa/madera/imgi_35_90-Mat-Ladin.jpg" },
                { key: "arkopa/madera/imgi_36_110-Mat-Yeni-Akcaagac", name: "Mat Yeni Akcaagac", file: "textures/arkopa/madera/imgi_36_110-Mat-Yeni-Akcaagac.jpg" },
                { key: "arkopa/madera/imgi_37_1208-Mat-Soho", name: "Mat Soho", file: "textures/arkopa/madera/imgi_37_1208-Mat-Soho.jpg" },
                { key: "arkopa/madera/imgi_38_112-Mat-Yenice-Mese", name: "Mat Yenice Mese", file: "textures/arkopa/madera/imgi_38_112-Mat-Yenice-Mese.jpg" },
                { key: "arkopa/madera/imgi_38_1959-Hg-Ozigo", name: "Hg Ozigo", file: "textures/arkopa/madera/imgi_38_1959-Hg-Ozigo.jpg" },
                { key: "arkopa/madera/imgi_39_108-Mat-Turk-Mese", name: "Mat Turk Mese", file: "textures/arkopa/madera/imgi_39_108-Mat-Turk-Mese.jpg" },
                { key: "arkopa/madera/imgi_39_1958-HG-Modena", name: "HG Modena", file: "textures/arkopa/madera/imgi_39_1958-HG-Modena.jpg" },
                { key: "arkopa/madera/imgi_40_155-HG-Ladin", name: "HG Ladin", file: "textures/arkopa/madera/imgi_40_155-HG-Ladin.jpg" }
            ]
        },
        {
            group: "Piedras", textures: [
                { key: "arkopa/piedras/imgi_23_1692-Mat-Premium-Bakir", name: "Mat Premium Bakir", file: "textures/arkopa/piedras/imgi_23_1692-Mat-Premium-Bakir.jpg" },
                { key: "arkopa/piedras/imgi_24_1690-Mat-Premium-Nikel", name: "Mat Premium Nikel", file: "textures/arkopa/piedras/imgi_24_1690-Mat-Premium-Nikel.jpg" },
                { key: "arkopa/piedras/imgi_50_2355-HG-Bej-Cement", name: "HG Bej Cement", file: "textures/arkopa/piedras/imgi_50_2355-HG-Bej-Cement.jpg" },
                { key: "arkopa/piedras/imgi_51_2260-HG-Gri-Cement", name: "HG Gri Cement", file: "textures/arkopa/piedras/imgi_51_2260-HG-Gri-Cement.jpg" },
                { key: "arkopa/piedras/imgi_52_2261-HG-Vizon-Cement", name: "HG Vizon Cement", file: "textures/arkopa/piedras/imgi_52_2261-HG-Vizon-Cement.jpg" },
                { key: "arkopa/piedras/imgi_53_2262-HG-Antrasit-Cement", name: "HG Antrasit Cement", file: "textures/arkopa/piedras/imgi_53_2262-HG-Antrasit-Cement.jpg" },
                { key: "arkopa/piedras/imgi_54_2789-Mat-Pietra", name: "Mat Pietra", file: "textures/arkopa/piedras/imgi_54_2789-Mat-Pietra.jpg" },
                { key: "arkopa/piedras/imgi_55_2845-HG-Pietra", name: "HG Pietra", file: "textures/arkopa/piedras/imgi_55_2845-HG-Pietra.jpg" },
                { key: "arkopa/piedras/imgi_60_2265-HG-Siyah-Venato", name: "HG Siyah Venato", file: "textures/arkopa/piedras/imgi_60_2265-HG-Siyah-Venato.jpg" },
                { key: "arkopa/piedras/imgi_61_2266-Mat-Siyah-Venato-1", name: "Mat Siyah Venato 1", file: "textures/arkopa/piedras/imgi_61_2266-Mat-Siyah-Venato-1.jpg" },
                { key: "arkopa/piedras/imgi_64_67-Ank-Metalik", name: "Ank Metalik", file: "textures/arkopa/piedras/imgi_64_67-Ank-Metalik.jpg" }
            ]
        },
        {

            group: "Tejidos", textures: [
                { key: "arkopa/tejidos/imgi_10_4530", name: "imgi_10_4530", file: "textures/arkopa/tejidos/imgi_10_4530.jpg" },
                { key: "arkopa/tejidos/imgi_63_1992-HG-Bronz", name: "HG Bronz", file: "textures/arkopa/tejidos/imgi_63_1992-HG-Bronz.jpg" },
                { key: "arkopa/tejidos/imgi_65_1583-HG-Ayna", name: "HG Ayna", file: "textures/arkopa/tejidos/imgi_65_1583-HG-Ayna.jpg" },
                { key: "arkopa/tejidos/imgi_66_1289-HG-Beyaz-Galaxy", name: "HG Beyaz Galaxy", file: "textures/arkopa/tejidos/imgi_66_1289-HG-Beyaz-Galaxy.jpg" },
                { key: "arkopa/tejidos/imgi_67_618-HG-Krem-Ekru", name: "HG Krem Ekru", file: "textures/arkopa/tejidos/imgi_67_618-HG-Krem-Ekru.jpg" },
                { key: "arkopa/tejidos/imgi_69_846-HG-Bal-Sedef", name: "HG Bal Sedef", file: "textures/arkopa/tejidos/imgi_69_846-HG-Bal-Sedef.jpg" },
                { key: "arkopa/tejidos/imgi_7_4527", name: "imgi_7_4527", file: "textures/arkopa/tejidos/imgi_7_4527.jpg" },
                { key: "arkopa/tejidos/imgi_71_1432-HG-Kahve-Galaxy", name: "HG Kahve Galaxy", file: "textures/arkopa/tejidos/imgi_71_1432-HG-Kahve-Galaxy.jpg" },
                { key: "arkopa/tejidos/imgi_72_1431-HG-Antrasit-Galaxy", name: "HG Antrasit Galaxy", file: "textures/arkopa/tejidos/imgi_72_1431-HG-Antrasit-Galaxy.jpg" },
                { key: "arkopa/tejidos/imgi_73_1290-HG-Siyah-Galaxy", name: "HG Siyah Galaxy", file: "textures/arkopa/tejidos/imgi_73_1290-HG-Siyah-Galaxy.jpg" },
                { key: "arkopa/tejidos/imgi_74_1294-HG-Kahve-Terra", name: "HG Kahve Terra", file: "textures/arkopa/tejidos/imgi_74_1294-HG-Kahve-Terra.jpg" },
                { key: "arkopa/tejidos/imgi_75_73-Mat-Beyaz", name: "Mat Beyaz", file: "textures/arkopa/tejidos/imgi_75_73-Mat-Beyaz.jpg" },
                { key: "arkopa/tejidos/imgi_77_88-Mat-Krem", name: "Mat Krem", file: "textures/arkopa/tejidos/imgi_77_88-Mat-Krem.jpg" },
                { key: "arkopa/tejidos/imgi_79_1164-HG-Acik-Keten", name: "HG Acik Keten", file: "textures/arkopa/tejidos/imgi_79_1164-HG-Acik-Keten.jpg" },
                { key: "arkopa/tejidos/imgi_8_4528", name: "imgi_8_4528", file: "textures/arkopa/tejidos/imgi_8_4528.jpg" },
                { key: "arkopa/tejidos/imgi_9_4529", name: "imgi_9_4529", file: "textures/arkopa/tejidos/imgi_9_4529.jpg" }
            ]
        },
        {
            group: "Unicolores", textures: [
                { key: "arkopa/unicolores/imgi_17_Arkopa-Akrilik-Renkler-Hg-Beyaz-", name: "HG Beyaz", file: "textures/arkopa/unicolores/imgi_17_Arkopa-Akrilik-Renkler-Hg-Beyaz-.jpg" },
                { key: "arkopa/unicolores/imgi_18_312-SM-Beyaz", name: "SM Beyaz", file: "textures/arkopa/unicolores/imgi_18_312-SM-Beyaz.jpg" },
                { key: "arkopa/unicolores/imgi_18_3500-RM-Albus", name: "RM Albus", file: "textures/arkopa/unicolores/imgi_18_3500-RM-Albus.jpg" },
                { key: "arkopa/unicolores/imgi_18_539-HG-Proje-Beyaz", name: "HG Proje Beyaz", file: "textures/arkopa/unicolores/imgi_18_539-HG-Proje-Beyaz.jpg" },
                { key: "arkopa/unicolores/imgi_18_Arkopa-Akrilik-Renkler-Hg-Krem-Akrilik-Sns-2323-", name: "HG Krem Akrilik", file: "textures/arkopa/unicolores/imgi_18_Arkopa-Akrilik-Renkler-Hg-Krem-Akrilik-Sns-2323-.jpg" },
                { key: "arkopa/unicolores/imgi_19_1150-HG-Porselen-Beyaz", name: "HG Porselen Beyaz", file: "textures/arkopa/unicolores/imgi_19_1150-HG-Porselen-Beyaz.jpg" },
                { key: "arkopa/unicolores/imgi_19_746-SM-Krem", name: "SM Krem", file: "textures/arkopa/unicolores/imgi_19_746-SM-Krem.jpg" },
                { key: "arkopa/unicolores/imgi_19_Arkopa-Akrilik-Renkler-Hg-Kasmir-Sns-2325-", name: "HG Kasmir", file: "textures/arkopa/unicolores/imgi_19_Arkopa-Akrilik-Renkler-Hg-Kasmir-Sns-2325-.jpg" },
                { key: "arkopa/unicolores/imgi_20_2277-SM-Acik-Gri", name: "SM Acik Gri", file: "textures/arkopa/unicolores/imgi_20_2277-SM-Acik-Gri.jpg" },
                { key: "arkopa/unicolores/imgi_20_3502-RM-Terra", name: "RM Terra", file: "textures/arkopa/unicolores/imgi_20_3502-RM-Terra.jpg" },
                { key: "arkopa/unicolores/imgi_20_845-HG-Bianco", name: "HG Bianco", file: "textures/arkopa/unicolores/imgi_20_845-HG-Bianco.jpg" },
                { key: "arkopa/unicolores/imgi_21_154-HG-Krem", file: "textures/arkopa/unicolores/imgi_21_154-HG-Krem.jpg" },
                { key: "arkopa/unicolores/imgi_21_3503-RM-Aura", name: "RM Aura", file: "textures/arkopa/unicolores/imgi_21_3503-RM-Aura.jpg" },
                { key: "arkopa/unicolores/imgi_21_747-SM-Yeni-Gri", name: "SM Yeni Gri", file: "textures/arkopa/unicolores/imgi_21_747-SM-Yeni-Gri.jpg" }
            ]
        }
    ],
    primadera: [
        {
            group: "Maderas", textures: [
                { key: "madera/andino", name: "Andino", file: "textures/primadera/madera/andino.jpg" },
                { key: "madera/bacata", name: "Bacata", file: "textures/primadera/madera/bacata.jpg" },
                { key: "madera/baudo", name: "Baudo", file: "textures/primadera/madera/baudo.jpg" },
                { key: "madera/boscus escandinavo", name: "Boscus Escandinavo", file: "textures/primadera/madera/boscus escandinavo.jpg" },
                { key: "madera/brooklyn oak", name: "Brooklyn Oak", file: "textures/primadera/madera/brooklyn oak.jpg" },
                { key: "madera/cedro", name: "Cedro", file: "textures/primadera/madera/cedro.jpg" },
                { key: "madera/chircal", name: "Chircal", file: "textures/primadera/madera/chircal.jpg" },
                { key: "madera/cocuy", name: "Cocuy", file: "textures/primadera/madera/cocuy.jpg" },
                { key: "madera/flormorado", name: "Flormorado", file: "textures/primadera/madera/flormorado.jpg" },
                { key: "madera/glaze", name: "Glaze", file: "textures/primadera/madera/glaze.jpg" },
                { key: "madera/iguaque", name: "Iguaque", file: "textures/primadera/madera/iguaque.jpg" },
                { key: "madera/ika", name: "Ika", file: "textures/primadera/madera/ika.jpg" },
                { key: "madera/kanua", name: "Kanua", file: "textures/primadera/madera/kanua.jpg" },
                { key: "madera/majuy", name: "Majuy", file: "textures/primadera/madera/majuy.jpg" },
                { key: "madera/maku", name: "Maku", file: "textures/primadera/madera/maku.jpg" },
                { key: "madera/mall", name: "Mall", file: "textures/primadera/madera/mall.jpg" },
                { key: "madera/mitu", name: "Mitu", file: "textures/primadera/madera/mitu.jpg" },
                { key: "madera/pacifico", name: "Pacifico", file: "textures/primadera/madera/pacifico.jpg" },
                { key: "madera/roble cenizo", name: "Roble Cenizo", file: "textures/primadera/madera/roble cenizo.jpg" },
                { key: "madera/rovere arena", name: "Rovere Arena", file: "textures/primadera/madera/rovere arena.jpg" },
                { key: "madera/rustic sand", name: "Rustic Sand", file: "textures/primadera/madera/rustic sand.jpg" },
                { key: "madera/sapan", name: "Sapan", file: "textures/primadera/madera/sapan.jpg" },
                { key: "madera/sikuani", name: "Sikuani", file: "textures/primadera/madera/sikuani.jpg" },
                { key: "madera/tambo", name: "Tambo", file: "textures/primadera/madera/tambo.jpg" },
                { key: "madera/taroa", name: "Taroa", file: "textures/primadera/madera/taroa.jpg" },
                { key: "madera/tauri", name: "Tauri", file: "textures/primadera/madera/tauri.jpg" },
                { key: "madera/tumaco", name: "Tumaco", file: "textures/primadera/madera/tumaco.jpg" },
                { key: "madera/volcanico", name: "Volcanico", file: "textures/primadera/madera/volcanico.jpg" },
                { key: "madera/wengue", name: "Wengue", file: "textures/primadera/madera/wengue.jpg" }
            ]
        },
        {
            group: "Piedras", textures: [
                { key: "piedra/checua", name: "Checua", file: "textures/primadera/piedra/checua.jpg" },
                { key: "piedra/suesca", name: "Suesca", file: "textures/primadera/piedra/suesca.jpg" },
                { key: "piedra/tausa", name: "Tausa", file: "textures/primadera/piedra/tausa.jpg" },
                { key: "piedra/tihua", name: "Tihua", file: "textures/primadera/piedra/tihua.jpg" }
            ]
        },
        {
            group: "Tejidos", textures: [
                { key: "tejido/london", name: "London", file: "textures/primadera/tejido/london.jpg" },
                { key: "tejido/tenza", name: "Tenza", file: "textures/primadera/tejido/tenza.jpg" }
            ]
        },
        {
            group: "Unicolores", textures: [
                { key: "unicolores/artico", name: "Ártico", file: "textures/primadera/unicolores/artico.jpg" },
                { key: "unicolores/bareque", name: "Bareque", file: "textures/primadera/unicolores/bareque.jpg" },
                { key: "unicolores/creta", name: "Creta", file: "textures/primadera/unicolores/creta.jpg" },
                { key: "unicolores/humo", name: "Humo", file: "textures/primadera/unicolores/humo.jpg" },
                { key: "unicolores/jayka", name: "Jayka", file: "textures/primadera/unicolores/jayka.jpg" },
                { key: "unicolores/sukta", name: "Sukta", file: "textures/primadera/unicolores/sukta.jpg" },
                { key: "unicolores/yalaa", name: "Yalaa", file: "textures/primadera/unicolores/yalaa.jpg" }
            ]
        },
    ]
};

// =======================
// INICIALIZACIÓN
// =======================
function init() {
    const container = document.getElementById("scene-container");
    scene = new THREE.Scene();
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    container.appendChild(renderer.domElement);

    // Make sure to set default rotation order for THREE.Object3D
    THREE.Object3D.DefaultUp.set(0, 1, 0);

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 90000);
    camera.position.set(200, 200, 300);
    camera.rotation.order = 'XYZ';
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.15;
    controls.rotateSpeed = 0.7;
    controls.zoomSpeed = 0.8;
    controls.panSpeed = 0.7;
    controls.enableZoom = true;
    controls.mouseButtons = {
        LEFT: THREE.MOUSE.ROTATE,
        MIDDLE: THREE.MOUSE.PAN,   // <-- Esto hace que la ruedita haga pan
        RIGHT: THREE.MOUSE.PAN
    }; transformControls = new THREE.TransformControls(camera, renderer.domElement);

    // Mejorar la configuración de los controles de transformación
    transformControls.setSize(0.8); // Tamaño más apropiado
    transformControls.setTranslationSnap(1); // Snap de 1 unidad para traslación
    transformControls.setRotationSnap(Math.PI / 12); // Snap de 15 grados para rotación

    // Asignar espacio de coordenadas local para que los ejes se alineen con el objeto
    transformControls.space = "local";

    transformControls.addEventListener("dragging-changed", (event) => {
        isDragging = event.value;
        controls.enabled = !event.value;
        if (!event.value && selectedObject) {
            snapToClosestSnapPoint(selectedObject);
            saveState();
        }
    });

    // Asegurarse que los controles se actualicen cuando se modifique el objeto
    transformControls.addEventListener("objectChange", () => {
        if (selectedObject) {
            // Si el objeto seleccionado tiene geometría, actualizar su bounding box
            if (selectedObject.geometry) {
                selectedObject.geometry.computeBoundingBox();
            }
            // Actualizar la posición de los controles
            updateTransformControlsPosition();
        }
    });

    // Asegurarse de que los controles se actualicen cuando cambia la cámara
    camera.addEventListener('change', () => {
        if (selectedObject) {
            updateTransformControlsPosition();
        }
    });

    scene.add(transformControls);    // Exponer variables globales para que js2.js pueda acceder a ellas
    exposeGlobalVariables();

    // Inicializar el selector de modelos
    populateModelSelect();

    // Validar y corregir problemas de escala en localStorage antes de restaurar
    validateAndFixLocalStorage();

    // Restaurar estado si existe
    const savedState = localStorage.getItem("modula_project_state");
    if (savedState) {
        restoreState(savedState);
        history = [savedState];
        redoStack = [];
    } else {
        saveState();
    }

    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    let dirLight = new THREE.DirectionalLight(0xffffff, 1);
    dirLight.position.set(5, 10, 5);
    scene.add(dirLight);

    const gridHelper = new THREE.GridHelper(1000, 100, 0x888888, 0x444444);
    gridHelper.position.y = 0.01;
    scene.add(gridHelper);
    scene.add(new THREE.AxesHelper(200));

    // Selección unificada para mouse y touch
    renderer.domElement.addEventListener("pointerdown", onPointerDown, false);
    renderer.domElement.addEventListener("dblclick", onDeselect);

    window.addEventListener("resize", onWindowResize);

    // DRAG SELECT (Selección por arrastre)
    renderer.domElement.addEventListener("pointerdown", function (event) {
        if (
            event.button !== 0 ||
            isDragging ||
            metroActive ||
            rectangleModeActive ||
            pushPullModeActive ||
            !ctrlPressed // <-- Solo si Control está presionado
        ) return;
        isDragSelecting = true;
        const rect = renderer.domElement.getBoundingClientRect();
        dragSelectStart = { x: event.clientX - rect.left, y: event.clientY - rect.top };

        // Crea el rectángulo visual
        dragSelectRect = document.createElement("div");
        dragSelectRect.style.position = "absolute";
        dragSelectRect.style.border = "2px solid #2196f3"; // Azul sólido
        dragSelectRect.style.background = "rgba(33,150,243,0.10)"; // Azul claro semitransparente
        dragSelectRect.style.pointerEvents = "none";
        dragSelectRect.style.zIndex = "10";
        dragSelectRect.style.left = dragSelectStart.x + "px";
        dragSelectRect.style.top = dragSelectStart.y + "px";
        dragSelectRect.style.width = "0px";
        dragSelectRect.style.height = "0px";
        document.getElementById("scene-container").appendChild(dragSelectRect);
    });
    renderer.domElement.addEventListener("pointermove", function (event) {
        if (!isDragSelecting || !dragSelectStart) return;
        const rect = renderer.domElement.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        const minX = Math.min(dragSelectStart.x, x);
        const minY = Math.min(dragSelectStart.y, y);
        const width = Math.abs(x - dragSelectStart.x);
        const height = Math.abs(y - dragSelectStart.y);

        dragSelectRect.style.left = minX + "px";
        dragSelectRect.style.top = minY + "px";
        dragSelectRect.style.width = width + "px";
        dragSelectRect.style.height = height + "px";
    });
    renderer.domElement.addEventListener("pointerup", function (event) {
        if (!isDragSelecting || !dragSelectStart) return;
        isDragSelecting = false;

        // Calcula el rectángulo de selección en pantalla
        const rect = renderer.domElement.getBoundingClientRect();
        const x1 = dragSelectStart.x, y1 = dragSelectStart.y;
        const x2 = event.clientX - rect.left, y2 = event.clientY - rect.top;
        const minX = Math.min(x1, x2), maxX = Math.max(x1, x2);
        const minY = Math.min(y1, y2), maxY = Math.max(y1, y2);

        // Selecciona los objetos cuyos centroides estén dentro del rectángulo
        selectedObjects = [];
        scene.children.forEach(obj => {
            // Selecciona Meshes individuales
            if (obj.isMesh && obj.type === "Mesh") {
                obj.geometry.computeBoundingBox();
                const bbox = obj.geometry.boundingBox;
                const center = bbox.getCenter(new THREE.Vector3()).applyMatrix4(obj.matrixWorld);
                const vector = center.clone().project(camera);
                const sx = (vector.x * 0.5 + 0.5) * rect.width;
                const sy = (-vector.y * 0.5 + 0.5) * rect.height;
                if (sx >= minX && sx <= maxX && sy >= minY && sy <= maxY) {
                    selectedObjects.push(obj);
                    if (obj.material) obj.material.color.set(0x00ff00);
                } else {
                    if (obj.material) obj.material.color.set(0x808080);
                }
            }
            // Selecciona Groups (modelos GLB/GLTF)
            else if (obj.type === "Group" && obj.children.length > 0) {
                // Calcula el centroide del grupo (promedio de los centros de sus Mesh hijos)
                let centers = [];
                obj.traverse(child => {
                    if (child.isMesh && child.geometry) {
                        child.geometry.computeBoundingBox();
                        const bbox = child.geometry.boundingBox;
                        centers.push(bbox.getCenter(new THREE.Vector3()).applyMatrix4(child.matrixWorld));
                    }
                });
                if (centers.length > 0) {
                    let groupCenter = centers.reduce((a, b) => a.add(b), new THREE.Vector3()).divideScalar(centers.length);
                    const vector = groupCenter.clone().project(camera);
                    const sx = (vector.x * 0.5 + 0.5) * rect.width;
                    const sy = (-vector.y * 0.5 + 0.5) * rect.height;
                    if (sx >= minX && sx <= maxX && sy >= minY && sy <= maxY) {
                        selectedObjects.push(obj);
                        // Opcional: resalta todos los hijos Mesh
                        obj.traverse(child => {
                            if (child.isMesh && child.material) child.material.color.set(0x00ff00);
                        });
                    } else {
                        obj.traverse(child => {
                            if (child.isMesh && child.material) child.material.color.set(0x808080);
                        });
                    }
                }
            }
        });

        // Limpia el rectángulo visual
        if (dragSelectRect && dragSelectRect.parentNode) {
            dragSelectRect.parentNode.removeChild(dragSelectRect);
            dragSelectRect = null;
        }
        dragSelectStart = null;

        // Si hay más de uno, agrupa para mover juntos
        if (selectedObjects.length > 1) {
            if (multiSelectGroup && multiSelectGroup.children.length > 0) {
                const children = [...multiSelectGroup.children];
                children.forEach(obj => {
                    const worldPos = obj.getWorldPosition(new THREE.Vector3());
                    scene.add(obj);
                    obj.position.copy(worldPos);
                });
                scene.remove(multiSelectGroup);
            }
            multiSelectGroup = new THREE.Group();
            centerGroupOnObjects(multiSelectGroup, selectedObjects);
            scene.add(multiSelectGroup);
            selectedObject = multiSelectGroup;
            transformControls.attach(multiSelectGroup);
            transformControls.setMode("translate");
        } else if (selectedObjects.length === 1) {
            selectedObject = selectedObjects[0];
            transformControls.attach(selectedObject);
            transformControls.setMode("translate");
        } else {
            selectedObject = null;
            transformControls.detach();
        }
        updateRotationDisplay();
    });

    animate();
}
// =======================
// ANIMACIÓN
// =======================
function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}
// =======================
// SELECCIÓN Y EVENTOS
// =======================
function onPointerDown(event) {
    if (isDragSelecting) return;
    if (isDragging) return;
    if (metroActive) return;
    const menu = document.getElementById("menu");
    if (menu.contains(event.target)) return;
    event.preventDefault();

    const rect = renderer.domElement.getBoundingClientRect();
    let clientX, clientY;
    if (event.touches && event.touches.length === 1) {
        clientX = event.touches[0].clientX;
        clientY = event.touches[0].clientY;
    } else {
        clientX = event.clientX;
        clientY = event.clientY;
    }
    const mouse = new THREE.Vector2(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1
    );
    const raycaster = new THREE.Raycaster();

    // Usar todos los objetos seleccionables de la escena
    raycaster.setFromCamera(mouse, camera);

    // Obtener todos los objetos de la escena que pueden ser seleccionados
    const selectableObjects = scene.children.filter(obj =>
        (obj.isMesh && obj.type === "Mesh") ||
        (obj.type === "Group")
    );

    // Intersectar solo el primer nivel de objetos
    let intersects = raycaster.intersectObjects(selectableObjects, false);

    // Si no hay intersecciones directas, buscar en los hijos
    if (intersects.length === 0) {
        intersects = raycaster.intersectObjects(selectableObjects, true);
    }

    if (intersects.length > 0) {
        // Obtener el objeto intersectado
        let clickedObject = intersects[0].object;

        // Si es un hijo dentro de un grupo, subir hasta el primer nivel bajo scene
        if (clickedObject.parent && clickedObject.parent !== scene) {
            // Solo ascendemos hasta el nivel justo debajo de scene para mantener individualidad
            let currentObject = clickedObject;
            while (currentObject.parent && currentObject.parent.parent && currentObject.parent !== scene) {
                currentObject = currentObject.parent;
            }
            clickedObject = currentObject;
        }

        // Si Ctrl está presionado, alterna selección múltiple
        if (ctrlPressed || event.metaKey) {
            const idx = selectedObjects.indexOf(clickedObject);
            if (idx === -1) {
                selectedObjects.push(clickedObject);
                if (clickedObject.material) clickedObject.material.color?.set(0x00ff00);
                else if (clickedObject.isMesh) clickedObject.material?.color?.set(0x00ff00);
            } else {
                selectedObjects.splice(idx, 1);
                if (clickedObject.material) clickedObject.material.color?.set(0x808080);
                else if (clickedObject.isMesh) clickedObject.material?.color?.set(0x808080);
            }

            // Si hay más de uno, usa el grupo para mover juntos
            if (selectedObjects.length > 1) {
                if (multiSelectGroup && multiSelectGroup.children.length > 0) {
                    const children = [...multiSelectGroup.children];
                    children.forEach(obj => {
                        const worldPos = obj.getWorldPosition(new THREE.Vector3());
                        scene.add(obj);
                        obj.position.copy(worldPos);
                    });
                    scene.remove(multiSelectGroup);
                }
                multiSelectGroup = new THREE.Group();
                centerGroupOnObjects(multiSelectGroup, selectedObjects);
                scene.add(multiSelectGroup);
                selectedObject = multiSelectGroup;
                attachTransformControls(multiSelectGroup, "translate");
            } else if (selectedObjects.length === 1) {
                selectedObject = selectedObjects[0];
                attachTransformControls(selectedObject, "translate");
            }
        } else {
            // Selección simple - resetear todos los colores primero
            scene.traverse(obj => {
                if (obj.isMesh && obj.material) {
                    obj.material.color?.set(0x808080);
                }
            });

            selectedObjects = [clickedObject];
            selectedObject = clickedObject;

            // Cambiar color del objeto seleccionado
            if (clickedObject.material) {
                clickedObject.material.color?.set(0x00ff00);
            } else if (clickedObject.isMesh) {
                clickedObject.material?.color?.set(0x00ff00);
            }

            // Usar nuestra función mejorada para adjuntar controles
            attachTransformControls(clickedObject, "translate");
        }

        updateRotationDisplay();

        // Actualizar dimensiones si es Mesh
        if (selectedObject && selectedObject.geometry) {
            selectedObject.geometry.computeBoundingBox();
            const bbox = selectedObject.geometry.boundingBox;
            document.getElementById("scaleWidth").value = ((bbox.max.x - bbox.min.x) * selectedObject.scale.x).toFixed(2);
            document.getElementById("scaleHeight").value = ((bbox.max.y - bbox.min.y) * selectedObject.scale.y).toFixed(2);
            document.getElementById("scaleDepth").value = ((bbox.max.z - bbox.min.z) * selectedObject.scale.z).toFixed(2);
        }
    }
}

window.addEventListener("keydown", function (event) {
    if (event.key === "Escape") {
        // Limpia selección visual para todos los Meshes y todos los hijos de Groups
        scene.traverse(obj => {
            if (obj.isMesh && obj.material) {
                obj.material.color.set(0x808080);
            }
        });
        // Elimina grupo temporal si existe
        if (multiSelectGroup && multiSelectGroup.children.length > 0) {
            const children = [...multiSelectGroup.children];
            children.forEach(obj => {
                const worldPos = obj.getWorldPosition(new THREE.Vector3());
                scene.add(obj);
                obj.position.copy(worldPos);
            });
            scene.remove(multiSelectGroup);
            multiSelectGroup = null;
        }
        selectedObject = null;
        selectedObjects = [];
        transformControls.detach();
        updateRotationDisplay();
    }
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

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// =======================
// ACCIONES DE ESCENA
// =======================
function parseDimensionInput(val) {
    let num = parseFloat(val);
    return isNaN(num) ? 0 : num;
}
function addCustomCube() {
    let name = document.getElementById("pieceName").value.trim();
    let width = parseDimensionInput(document.getElementById("width").value);
    let height = parseDimensionInput(document.getElementById("height").value);
    let depth = parseDimensionInput(document.getElementById("depth").value);
    if (!name) return alert("Por favor, ingresa un nombre para la pieza.");
    if (width <= 0 || height <= 0 || depth <= 0) return alert("Las dimensiones deben ser mayores a 0.");
    let geometry = new THREE.BoxGeometry(width, height, depth);
    const material = new THREE.MeshStandardMaterial({ color: 0x808080 });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(0, height / 2, 0);
    mesh.userData.name = name;
    scene.add(mesh);
    document.getElementById("pieceName").value = "";
    saveState();
}

function deleteSelected() {
    let deletedSomething = false;

    // Eliminar múltiples objetos seleccionados
    if (selectedObjects && selectedObjects.length > 0) {
        // Crear una copia del array para evitar problemas durante la iteración
        const objectsToDelete = [...selectedObjects];

        objectsToDelete.forEach(obj => {
            if (obj && obj.parent) {
                scene.remove(obj);

                // Si el objeto tiene geometría y material, liberarlos
                if (obj.geometry) {
                    obj.geometry.dispose();
                }
                if (obj.material) {
                    if (Array.isArray(obj.material)) {
                        obj.material.forEach(mat => {
                            if (mat.map) mat.map.dispose();
                            mat.dispose();
                        });
                    } else {
                        if (obj.material.map) obj.material.map.dispose();
                        obj.material.dispose();
                    }
                }
            }
        });

        selectedObjects = [];
        deletedSomething = true;

        // Si hay un grupo de selección múltiple, eliminarlo también
        if (multiSelectGroup) {
            if (multiSelectGroup.parent) {
                scene.remove(multiSelectGroup);
            }
            multiSelectGroup = null;
        }
    }

    // Eliminar objeto individual seleccionado
    if (selectedObject && selectedObject !== multiSelectGroup) {
        if (selectedObject.parent) {
            scene.remove(selectedObject);

            // Si el objeto tiene geometría y material, liberarlos
            if (selectedObject.geometry) {
                selectedObject.geometry.dispose();
            }
            if (selectedObject.material) {
                if (Array.isArray(selectedObject.material)) {
                    selectedObject.material.forEach(mat => {
                        if (mat.map) mat.map.dispose();
                        mat.dispose();
                    });
                } else {
                    if (selectedObject.material.map) selectedObject.material.map.dispose();
                    selectedObject.material.dispose();
                }
            }
        }

        selectedObject = null;
        deletedSomething = true;
    }

    // Limpiar controles de transformación
    if (deletedSomething) {
        transformControls.detach();

        // Actualizar la rotación display
        if (typeof updateRotationDisplay === 'function') {
            updateRotationDisplay();
        }

        saveState();
        showToast("Pieza(s) eliminada(s)");
    } else {
        showToast("Selecciona una pieza para eliminar");
    }
}
// =======================
// TEXTURAS - OPTIMIZADAS
// =======================

// Función optimizada para aplicar texturas con caché
function applyTextureToSelected(texFile, textureInfo = null) {
    // Validación de objeto seleccionado
    if (!selectedObject) {
        showToast("Selecciona una pieza para aplicar la textura");
        return;
    }

    // Si no hay textura especificada
    if (!texFile) {
        showToast("Archivo de textura no válido");
        return;
    }

    // Verificar si es una data URL (textura personalizada)
    const isDataURL = texFile.startsWith('data:');

    // Usar caché para evitar cargar múltiples veces la misma textura
    let texture;
    if (!isDataURL && textures.cache.has(texFile)) {
        texture = textures.cache.get(texFile);
        applyTextureToObject(texture);
    } else {
        // Mostrar indicador de carga
        showToast("Cargando textura...");

        // Cargar textura
        texture = textureLoader.load(
            texFile,
            // Callback de éxito
            function (loadedTexture) {
                // Solo cachear texturas que no sean data URLs
                if (!isDataURL) {
                    textures.cache.set(texFile, loadedTexture);
                }
                applyTextureToObject(loadedTexture);
            },
            // Callback de progreso (opcional)
            undefined,
            // Callback de error
            function (error) {
                console.error("Error al cargar la textura:", error);
                showToast("Error al cargar la textura. Verifica que el archivo sea una imagen válida.");
            }
        );
    }

    // Función auxiliar para aplicar la textura al objeto
    function applyTextureToObject(tex) {
        // Si el objeto ha sido deseleccionado durante la carga
        if (!selectedObject) return;

        // Configurar repetición de textura para mejor apariencia
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(1, 1);

        // Determinar si aplicar a un objeto o a una selección múltiple
        if (selectedObject === multiSelectGroup && selectedObjects.length > 0) {
            selectedObjects.forEach(obj => {
                if (obj.material) {
                    obj.material.map = tex;
                    obj.material.needsUpdate = true;

                    // Guardar información de la textura en el material
                    if (!obj.material.userData) obj.material.userData = {};
                    obj.material.userData.texturePath = texFile;
                    if (textureInfo) {
                        obj.material.userData.textureProvider = textureInfo.provider;
                        obj.material.userData.textureKey = textureInfo.key;
                        obj.material.userData.textureName = textureInfo.name;
                    }
                }
            });
            showToast(`Textura aplicada a ${selectedObjects.length} piezas`);
        } else {
            selectedObject.material.map = tex;
            selectedObject.material.needsUpdate = true;

            // Guardar información de la textura en el material
            if (!selectedObject.material.userData) selectedObject.material.userData = {};
            selectedObject.material.userData.texturePath = texFile;
            if (textureInfo) {
                selectedObject.material.userData.textureProvider = textureInfo.provider;
                selectedObject.material.userData.textureKey = textureInfo.key;
                selectedObject.material.userData.textureName = textureInfo.name;
            }

            showToast("Textura aplicada");
        }

        saveState();
    }
}

// Función optimizada para mostrar la galería de texturas
function showProviderTextures(provider) {
    provider = provider.toLowerCase();
    const textureGallery = document.getElementById("textureGallery");

    if (!textureGallery) {
        console.error("Elemento textureGallery no encontrado");
        return;
    }

    // Limpiar galería existente
    textureGallery.innerHTML = "";

    // Verificar que el proveedor exista
    if (!providerTextures[provider]) {
        textureGallery.innerHTML = "<div style='color:#fff;padding:10px;'>Proveedor de texturas no disponible</div>";
        return;
    }

    // Usar fragmento de documento para mayor eficiencia
    const fragment = document.createDocumentFragment();

    // Crear la galería para cada grupo
    providerTextures[provider].forEach(group => {
        // Crear título de grupo
        const groupTitle = createGroupTitle(group.group);
        fragment.appendChild(groupTitle);

        // Crear contenedor de texturas para este grupo
        const textureContainer = document.createElement("div");
        textureContainer.className = "texture-container";
        textureContainer.style.display = "flex";
        textureContainer.style.flexWrap = "wrap";
        textureContainer.style.gap = "4px";
        textureContainer.style.marginBottom = "10px";

        // Crear botones de textura
        group.textures.forEach(tex => {
            const textureButton = createTextureButton(tex, provider);
            textureContainer.appendChild(textureButton);
        });

        fragment.appendChild(textureContainer);
    });

    // Añadir todo de una vez para mejor rendimiento
    textureGallery.appendChild(fragment);
}

// Función auxiliar para crear título de grupo
function createGroupTitle(title) {
    const groupTitle = document.createElement("div");
    groupTitle.textContent = title;
    groupTitle.className = "texture-group-title";

    // Aplicar estilos
    Object.assign(groupTitle.style, {
        width: "100%",
        fontWeight: "bold",
        margin: "8px 0 4px 0",
        fontSize: "13px",
        color: "#fff",
        backgroundColor: "rgba(0,0,0,0.2)",
        padding: "3px 8px",
        borderRadius: "4px"
    });

    return groupTitle;
}

// Función auxiliar para crear botones de textura
function createTextureButton(tex, provider = null) {
    const btn = document.createElement("button");
    btn.title = tex.name;

    // Aplicar estilos
    Object.assign(btn.style, {
        backgroundImage: `url('${tex.file}')`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        width: "44px",
        height: "44px",
        border: "1px solid #444",
        borderRadius: "3px",
        cursor: "pointer",
        transition: "transform 0.1s, box-shadow 0.1s"
    });

    // Efectos hover
    btn.addEventListener("mouseover", () => {
        btn.style.transform = "scale(1.05)";
        btn.style.boxShadow = "0 0 5px rgba(255,255,255,0.5)";
    });

    btn.addEventListener("mouseout", () => {
        btn.style.transform = "scale(1)";
        btn.style.boxShadow = "none";
    });

    // Evento click con información de la textura
    btn.onclick = function () {
        const textureInfo = provider ? {
            provider: provider,
            key: tex.key,
            name: tex.name
        } : null;
        applyTextureToSelected(tex.file, textureInfo);
    };

    return btn;
}
// =======================
// MANEJO DE TEXTURAS PERSONALIZADAS
// =======================

// Event listener para el input de archivos de texturas personalizadas
document.addEventListener("DOMContentLoaded", function () {
    const customTextureInput = document.getElementById("customTextureInput");
    if (customTextureInput) {
        customTextureInput.addEventListener("change", handleCustomTextureUpload);
        console.log("✅ Event listener para texturas personalizadas configurado");
    } else {
        console.error("❌ Input de texturas personalizadas no encontrado");
    }
});

// Función para manejar la subida de texturas personalizadas
function handleCustomTextureUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    console.log("Procesando archivo de textura personalizada:", file.name, "Tamaño:", file.size);

    // Validar que sea una imagen
    if (!file.type.startsWith('image/')) {
        showToast("Por favor selecciona un archivo de imagen válido (JPG, PNG, WebP, etc.)");
        return;
    }

    // Validar tamaño del archivo (máximo 10MB)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
        showToast("El archivo es demasiado grande. Máximo 10MB permitido");
        return;
    }

    const reader = new FileReader();
    reader.onload = function (e) {
        const imageDataUrl = e.target.result;
        console.log("Data URL generada, longitud:", imageDataUrl.length);

        // Crear objeto de textura personalizada
        const customTexture = {
            name: file.name.split('.')[0], // Nombre sin extensión
            file: imageDataUrl,
            type: "custom",
            timestamp: Date.now()
        };

        // Agregar a la lista de texturas personalizadas
        if (!customTextures) {
            customTextures = [];
        }

        // Verificar si ya existe una textura con el mismo nombre
        const existingIndex = customTextures.findIndex(tex => tex.name === customTexture.name);
        if (existingIndex !== -1) {
            // Reemplazar textura existente
            customTextures[existingIndex] = customTexture;
            showToast("Textura actualizada: " + customTexture.name);
        } else {
            // Agregar nueva textura
            customTextures.push(customTexture);
            showToast("Textura agregada: " + customTexture.name);
        }

        console.log("Total de texturas personalizadas:", customTextures.length);

        // Guardar en localStorage
        try {
            localStorage.setItem("modula_custom_textures", JSON.stringify(customTextures));
            console.log("Texturas guardadas en localStorage correctamente");
        } catch (error) {
            console.error("Error al guardar texturas personalizadas:", error);
            showToast("Error al guardar la textura en el navegador");
            return;
        }

        // Actualizar la galería de texturas personalizadas en el panel
        updateCustomTextureGallery();

        // Limpiar el input
        event.target.value = '';
    };

    reader.onerror = function () {
        console.error("Error al leer el archivo de imagen");
        showToast("Error al leer el archivo de imagen");
    };

    reader.readAsDataURL(file);
}

// Función para actualizar la galería de texturas personalizadas en el panel
function updateCustomTextureGallery() {
    const gallery = document.getElementById("customTextureGallery");
    if (!gallery) return;

    gallery.innerHTML = "";

    if (!customTextures || customTextures.length === 0) {
        const msg = document.createElement("div");
        msg.textContent = "No hay texturas personalizadas";
        msg.style.color = "#999";
        msg.style.fontSize = "12px";
        msg.style.padding = "8px";
        gallery.appendChild(msg);
        return;
    }

    customTextures.forEach((texture, index) => {
        const container = document.createElement("div");
        container.style.position = "relative";
        container.style.display = "inline-block";

        const btn = document.createElement("button");
        btn.style.backgroundImage = `url('${texture.file}')`;
        btn.style.backgroundSize = "cover";
        btn.style.backgroundPosition = "center";
        btn.style.width = "40px";
        btn.style.height = "40px";
        btn.style.border = "2px solid #444";
        btn.style.borderRadius = "4px";
        btn.style.cursor = "pointer";
        btn.style.margin = "2px";
        btn.title = texture.name;

        btn.onclick = function () {
            applyTextureToSelected(texture.file);
        };

        // Botón para eliminar textura
        const deleteBtn = document.createElement("button");
        deleteBtn.innerHTML = "×";
        deleteBtn.style.position = "absolute";
        deleteBtn.style.top = "-5px";
        deleteBtn.style.borderRadius = "50%";
        deleteBtn.style.background = "#ff4444";
        deleteBtn.style.color = "white";
        deleteBtn.style.border = "none";
        deleteBtn.style.fontSize = "10px";
        deleteBtn.style.cursor = "pointer";
        deleteBtn.style.lineHeight = "14px";
        deleteBtn.title = "Eliminar textura";

        deleteBtn.onclick = function (e) {
            e.stopPropagation();
            removeCustomTexture(index);
        };

        container.appendChild(btn);
        container.appendChild(deleteBtn);
        gallery.appendChild(container);
    });
}

// Función para eliminar una textura personalizada
function removeCustomTexture(index) {
    if (!customTextures || index < 0 || index >= customTextures.length) return;

    const textureName = customTextures[index].name;
    customTextures.splice(index, 1);

    // Guardar en localStorage
    try {
        localStorage.setItem("modula_custom_textures", JSON.stringify(customTextures));
        showToast("Textura eliminada: " + textureName);
    } catch (error) {
        console.error("Error al guardar texturas personalizadas:", error);
    }    // Actualizar galerías
    updateCustomTextureGallery();
}

// Lógica para texturas personalizadas
let customTextures = [];

const savedCustomTextures = localStorage.getItem("modula_custom_textures");
if (savedCustomTextures) {
    customTextures = JSON.parse(savedCustomTextures);
}

// Escucha el cambio de proveedor y muestra las texturas
document.getElementById("providerSelect").addEventListener("change", function () {
    const provider = this.value.toLowerCase();
    if (providerTextures[provider]) {
        showProviderTextures(provider);
    } else {
        console.error(`Proveedor de texturas no encontrado: ${provider}`);
        const textureGallery = document.getElementById("textureGallery");
        if (textureGallery) {
            textureGallery.innerHTML = "<div style='color:#fff;padding:10px;'>Proveedor de texturas no disponible</div>";
        }
    }
});

// Cargar las texturas del proveedor seleccionado al inicio
window.addEventListener("DOMContentLoaded", function () {
    const providerSelect = document.getElementById("providerSelect");
    const provider = providerSelect.value;
    showProviderTextures(provider);

    // Inicializar galería de texturas personalizadas
    updateCustomTextureGallery();
});

function updateTextureOptions() {
    // Llama a la función real que actualiza la galería de texturas
    const provider = document.getElementById("providerSelect").value;
    showProviderTextures(provider);
}

// =======================
// ROTACIÓN Y ESCALA
// =======================
function rotateObject(axis, angle) {
    if (!selectedObject) return alert("Selecciona un objeto antes de rotarlo.");
    let radians = THREE.MathUtils.degToRad(angle);      // Usar un objeto Euler para evitar problemas con quaternions
    // Asegurar que el objeto tiene un orden de rotación definido
    if (!selectedObject.rotation.order) {
        selectedObject.rotation.order = 'XYZ';
    }

    // Crear un objeto Euler con el mismo orden que el objeto seleccionado
    const euler = new THREE.Euler(0, 0, 0, selectedObject.rotation.order);

    // Copiar la rotación actual
    euler.set(selectedObject.rotation.x, selectedObject.rotation.y, selectedObject.rotation.z);

    // Aplicar la rotación al eje correspondiente
    if (axis === 'x') euler.x += radians;
    if (axis === 'y') euler.y += radians;
    if (axis === 'z') euler.z += radians;

    // Aplicar la nueva rotación al objeto
    selectedObject.rotation.set(euler.x, euler.y, euler.z);

    updateRotationDisplay();
    saveState();
}

function updateRotationDisplay() {
    if (!selectedObject) {
        document.getElementById("rotationX").innerText = `X: 0°`;
        document.getElementById("rotationY").innerText = `Y: 0°`;
        document.getElementById("rotationZ").innerText = `Z: 0°`;
        return;
    }
    let rx = Math.round(THREE.MathUtils.radToDeg(selectedObject.rotation.x)) % 360;
    let ry = Math.round(THREE.MathUtils.radToDeg(selectedObject.rotation.y)) % 360;
    let rz = Math.round(THREE.MathUtils.radToDeg(selectedObject.rotation.z)) % 360;
    document.getElementById("rotationX").innerText = `X: ${rx}°`;
    document.getElementById("rotationY").innerText = `Y: ${ry}°`;
    document.getElementById("rotationZ").innerText = `Z: ${rz}°`;
}

function updateScale() {
    if (!selectedObject) return;
    let scaleFactor = parseFloat(document.getElementById("scaleRange").value);
    selectedObject.scale.set(scaleFactor, scaleFactor, scaleFactor);
    document.getElementById("scaleValue").innerText = scaleFactor + "x";
    saveState();
}

document.querySelectorAll('#scale-controls input[type="number"]').forEach(input => {
    input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            updateCustomScale();
        }
    });
});

function updateCustomScale() {
    const height = parseFloat(document.getElementById('scaleHeight').value);
    const width = parseFloat(document.getElementById('scaleWidth').value);
    const depth = parseFloat(document.getElementById('scaleDepth').value);

    if (isNaN(height) || isNaN(width) || isNaN(depth)) {
        showToast("Por favor ingresa valores válidos.");
        return;
    }

    if (!selectedObject) {
        showToast("Selecciona un objeto para aplicar la escala.");
        return;
    }

    // Actualizar la geometría del cubo seleccionado
    const newGeometry = new THREE.BoxGeometry(width, height, depth);
    selectedObject.geometry.dispose(); // Liberar la geometría anterior
    selectedObject.geometry = newGeometry;

    // Actualizar la posición del cubo para mantenerlo centrado
    selectedObject.position.set(0, height / 2, 0);

    // Guardar el estado actualizado
    saveState();

    console.log(`Escala actualizada: Alto=${height}, Ancho=${width}, Espesor=${depth}`);
}

function resetScale() {
    if (!selectedObject) return;
    selectedObject.scale.set(1, 1, 1);
    document.getElementById("scaleRange").value = 1;
    document.getElementById("scaleValue").innerText = "1x";
    saveState();
}
// =======================
// ESTADO / HISTORIAL - OPTIMIZADO
// =======================

/**
 * Sistema mejorado de deshacer/rehacer
 * Captura todos los movimientos, agregados y borrados de modelos 3D
 */
function saveState() {
    // Límite del historial para prevenir consumo excesivo de memoria
    const MAX_HISTORY_LENGTH = 50;

    try {
        // Filtrar solo objetos relevantes (meshes y grupos importados)
        let state = scene.children
            .filter(obj => (obj.isMesh || obj.type === "Group") &&
                !obj.name.includes("Helper") &&
                !obj.name.includes("TransformControls") &&
                !obj.name.includes("Axes") &&
                !obj.name.includes("Grid"))
            .map(serializeObject);

        // Guardar en localStorage con manejo de excepciones
        try {
            localStorage.setItem("modula_project_state", JSON.stringify(state));
        } catch (e) {
            console.warn("No se pudo guardar en localStorage:", e.message);
        }

        // Añadir al historial y limitar longitud
        const stateStr = JSON.stringify(state);

        // Solo agregar si el estado es diferente al último
        if (history.length === 0 || history[history.length - 1] !== stateStr) {
            history.push(stateStr);
            if (history.length > MAX_HISTORY_LENGTH) {
                history.shift(); // Eliminar estado más antiguo
            }

            // Limpiar pila de rehacer cuando se hace una nueva acción
            redoStack = [];

            // Actualizar el estado de los botones
            updateUndoRedoButtons();
        }

    } catch (error) {
        console.error("Error al guardar estado:", error);
    }
}

/**
 * Función para actualizar el estado visual de los botones de deshacer/rehacer
 */
function updateUndoRedoButtons() {
    const undoButton = document.getElementById("undoButton");
    const redoButton = document.getElementById("redoButton");

    if (undoButton) {
        undoButton.disabled = history.length < 2;
        undoButton.style.opacity = history.length < 2 ? "0.5" : "1";
    }

    if (redoButton) {
        redoButton.disabled = redoStack.length === 0;
        redoButton.style.opacity = redoStack.length === 0 ? "0.5" : "1";
    }
}

/**
 * Función auxiliar para serializar un objeto 3D
 */
function serializeObject(obj) {
    // Modelo importado (GLB/GLTF/OBJ/STL)
    if (obj.userData?.isImportedModel && obj.userData?.modelPath) {
        return {
            isImportedModel: true,
            modelPath: obj.userData.modelPath,
            position: serializeVector3(obj.position),
            rotation: serializeEuler(obj.rotation),
            scale: serializeVector3(obj.scale)
        };
    }

    // Modelo STL importado (compatibilidad con el código existente)
    if (obj.userData?.type === "ImportedMesh" || obj.name?.startsWith("ImportedSTL_")) {
        return {
            isImportedSTL: true,
            importId: obj.userData?.importId || obj.name,
            modelPath: obj.userData?.modelPath,
            position: serializeVector3(obj.position),
            rotation: serializeEuler(obj.rotation),
            scale: serializeVector3(obj.scale),
            name: obj.userData?.name || "Modelo importado",
            geometry: {
                type: obj.geometry?.type || "BufferGeometry",
                uuid: obj.geometry?.uuid
            },
            material: {
                color: obj.material?.color?.getHex() || 0xcccccc,
                mapSrc: obj.material?.map?.image?.src || obj.material?.map?.source?.src || null,
                texturePath: obj.material?.userData?.texturePath || null,
            }
        };
    }

    // Grupo manual de objetos
    if (obj.type === "Group") {
        return {
            isGroup: true,
            children: obj.children
                .filter(child => child.isMesh)
                .map(child => ({
                    geometryType: child.geometry?.type || "BoxGeometry",
                    geometryParams: child.geometry?.parameters || {},
                    position: serializeVector3(child.position),
                    rotation: serializeEuler(child.rotation),
                    scale: serializeVector3(child.scale),
                    material: {
                        color: child.material?.color?.getHex() || 0x808080,
                        mapSrc: child.material?.map?.image?.src || child.material?.map?.source?.src || null,
                        texturePath: child.material?.userData?.texturePath || null,
                        textureProvider: child.material?.userData?.textureProvider || null,
                        textureKey: child.material?.userData?.textureKey || null,
                        textureName: child.material?.userData?.textureName || null
                    },
                    name: child.userData?.name || "Sin nombre"

                })),
            position: serializeVector3(obj.position),
            rotation: serializeEuler(obj.rotation),
            scale: serializeVector3(obj.scale)
        };
    }

    // Mesh estándar
    return {
        geometryType: obj.geometry?.type || "BoxGeometry",
        geometryParams: obj.geometry?.parameters || {},
        position: serializeVector3(obj.position),
        rotation: serializeEuler(obj.rotation),
        scale: serializeVector3(obj.scale),
        material: {
            color: obj.material?.color?.getHex() || 0x808080,
            mapSrc: obj.material?.map?.image?.src || obj.material?.map?.source?.src || null,
            texturePath: obj.material?.userData?.texturePath || null,
            textureProvider: obj.material?.userData?.textureProvider || null,
            textureKey: obj.material?.userData?.textureKey || null,
            textureName: obj.material?.userData?.textureName || null
        },
        name: obj.userData?.name || "Sin nombre"
    };
}

// Funciones auxiliares de serialización
function serializeVector3(vec) {
    return vec ? { x: vec.x, y: vec.y, z: vec.z } : { x: 0, y: 0, z: 0 };
}

function serializeEuler(euler) {
    return euler ? { x: euler.x, y: euler.y, z: euler.z, order: euler.order } : { x: 0, y: 0, z: 0, order: 'XYZ' };
}

function restoreState(stateString) {
    const state = JSON.parse(stateString);
    scene.children = scene.children.filter(obj => !(obj.isMesh || obj.type === "Group"));

    state.forEach(data => {
        // Caso 1: Modelo GLB/GLTF importado
        if (data.isImportedModel && data.modelPath && (data.modelPath.endsWith('.glb') || data.modelPath.endsWith('.gltf'))) {
            const loader = new THREE.GLTFLoader();
            loader.load(data.modelPath, function (gltf) {
                const model = gltf.scene;
                model.position.copy(data.position);

                // Asegurarse de que la rotación se aplica correctamente con el orden XYZ
                if (data.rotation && data.rotation.x !== undefined) {
                    model.rotation.set(data.rotation.x, data.rotation.y, data.rotation.z, data.rotation.order || 'XYZ');
                }

                // Aplicar la escala de forma robusta
                if (data.scale && data.scale.x !== undefined && data.scale.y !== undefined && data.scale.z !== undefined) {
                    model.scale.set(data.scale.x, data.scale.y, data.scale.z);
                } else {
                    model.scale.set(1, 1, 1); // Default scale if not present or invalid
                }

                model.userData.isImportedModel = true;
                model.userData.modelPath = data.modelPath;
                model.userData.originalScale = data.scale || { x: 1, y: 1, z: 1 };
                scene.add(model);
            });
            return;
        }

        // Caso 2: Modelo STL importado
        if (data.isImportedSTL && data.modelPath && data.modelPath.endsWith('.stl')) {
            const loader = new THREE.STLLoader();
            loader.load(data.modelPath, function (geometry) {
                generateBoxUVs(geometry);
                geometry.computeVertexNormals();
                geometry.computeBoundingBox();

                // Crear material similar al original
                const material = new THREE.MeshStandardMaterial({
                    color: data.material?.color || 0xcccccc,
                    flatShading: true,
                    side: THREE.DoubleSide
                });

                // Restaurar textura si existe
                if (data.material && data.material.texturePath) {
                    material.map = textureLoader.load(data.material.texturePath);
                    material.needsUpdate = true;
                }

                const mesh = new THREE.Mesh(geometry, material);
                mesh.name = data.importId || `ImportedSTL_restored_${Date.now()}`;

                // Restaurar userData
                mesh.userData = {
                    name: data.name || "Modelo STL importado",
                    type: "ImportedMesh",
                    isImportedSTL: true,
                    modelPath: data.modelPath,
                    importId: data.importId
                };

                // IMPORTANTE: Centrar la geometría en el objeto para evitar desplazamientos
                const box = new THREE.Box3().setFromObject(mesh);
                const center = box.getCenter(new THREE.Vector3());
                mesh.geometry.translate(-center.x, -center.y, -center.z);

                // Aplicar transformaciones guardadas
                if (data.position) {
                    mesh.position.set(data.position.x || 0, data.position.y || 0, data.position.z || 0);
                }

                if (data.rotation) {
                    mesh.rotation.set(data.rotation.x || 0, data.rotation.y || 0, data.rotation.z || 0);
                    if (data.rotation.order) {
                        mesh.rotation.order = data.rotation.order;
                    }
                }

                // Aplicar escala garantizando valores válidos
                if (data.scale && data.scale.x > 0 && data.scale.y > 0 && data.scale.z > 0) {
                    mesh.scale.set(data.scale.x, data.scale.y, data.scale.z);
                } else {
                    mesh.scale.set(1, 1, 1); // Escala predeterminada
                }

                scene.add(mesh);
            });
            return;
        }

        // Caso 3: Geometrías estándar de Three.js (BoxGeometry, etc.)
        let geometry;
        if (data.geometryType === "BoxGeometry") {
            geometry = new THREE.BoxGeometry(
                data.geometryParams.width || 1,
                data.geometryParams.height || 1,
                data.geometryParams.depth || 1
            );
        } else if (data.geometryType === "SphereGeometry") {
            geometry = new THREE.SphereGeometry(
                data.geometryParams.radius || 1,
                32, 32
            );
        } else if (data.geometryType === "CylinderGeometry") {
            geometry = new THREE.CylinderGeometry(
                data.geometryParams.radiusTop || 1,
                data.geometryParams.radiusBottom || 1,
                data.geometryParams.height || 1,
                32
            );
        } else {
            geometry = new THREE.BoxGeometry(1, 1, 1);
        }

        let materialColor = (data.material && data.material.color !== undefined) ? data.material.color : 0x808080;
        let material = new THREE.MeshStandardMaterial({ color: materialColor });

        // Restaurar texturas mejorado
        if (data.material) {
            // Intentar cargar desde texturePath primero (nueva funcionalidad)
            if (data.material.texturePath) {
                try {
                    material.map = textureLoader.load(data.material.texturePath);
                    material.needsUpdate = true;

                    // Restaurar información de la textura en el material
                    if (!material.userData) material.userData = {};
                    material.userData.texturePath = data.material.texturePath;
                    if (data.material.textureProvider) material.userData.textureProvider = data.material.textureProvider;
                    if (data.material.textureKey) material.userData.textureKey = data.material.textureKey;
                    if (data.material.textureName) material.userData.textureName = data.material.textureName;
                } catch (error) {
                    console.warn("No se pudo cargar la textura desde texturePath:", data.material.texturePath);
                }
            }
            // Fallback a mapSrc (funcionalidad anterior)
            else if (data.material.mapSrc) {
                try {
                    material.map = textureLoader.load(data.material.mapSrc);
                    material.needsUpdate = true;
                } catch (error) {
                    console.warn("No se pudo cargar la textura desde mapSrc:", data.material.mapSrc);
                }
            }
            // Fallback a textureType (funcionalidad más antigua)
            else if (data.material.textureType && data.material.textureType !== "none") {
                if (textures[data.material.textureType]) {
                    material.map = textures[data.material.textureType];
                    material.needsUpdate = true;
                }
            }
        }

        let mesh = new THREE.Mesh(geometry, material);

        // Restaurar posición
        if (data.position) {
            mesh.position.set(data.position.x || 0, data.position.y || 0, data.position.z || 0);
        }

        // Restaurar rotación con verificación de validez
        if (data.rotation && data.rotation.x !== undefined) {
            mesh.rotation.set(data.rotation.x, data.rotation.y, data.rotation.z);
            if (data.rotation.order) {
                mesh.rotation.order = data.rotation.order;
            }
        }

        // CORREGIR ESCALA: Verificar que la escala sea válida y no sea demasiado pequeña
        let scaleToApply = new THREE.Vector3(1, 1, 1);
        if (data.scale) {
            // Verificar que los valores de escala sean válidos y no sean microscópicos
            const minScale = 0.001; // Escala mínima para evitar objetos invisibles
            const maxScale = 1000;  // Escala máxima razonable

            scaleToApply.x = Math.max(minScale, Math.min(maxScale, data.scale.x || 1));
            scaleToApply.y = Math.max(minScale, Math.min(maxScale, data.scale.y || 1));
            scaleToApply.z = Math.max(minScale, Math.min(maxScale, data.scale.z || 1));

            // Si la escala es sospechosamente pequeña, resetear a 1
            if (scaleToApply.x < 0.01 || scaleToApply.y < 0.01 || scaleToApply.z < 0.01) {
                console.warn("Escala muy pequeña detectada, reseteando a 1:", data.scale);
                scaleToApply.set(1, 1, 1);
            }
        }

        mesh.scale.copy(scaleToApply);
        mesh.userData.name = data.name || "Sin nombre";

        // Verificar que el objeto tenga un tamaño razonable después de aplicar escala
        mesh.geometry.computeBoundingBox();
        const bbox = mesh.geometry.boundingBox;
        const size = new THREE.Vector3();
        bbox.getSize(size);
        size.multiply(mesh.scale);

        // Si el objeto es demasiado pequeño, ajustar la escala
        const minSize = 0.1;
        if (size.x < minSize || size.y < minSize || size.z < minSize) {
            console.warn("Objeto demasiado pequeño detectado, ajustando escala");
            const scaleFactor = Math.max(minSize / size.x, minSize / size.y, minSize / size.z, 1);
            mesh.scale.multiplyScalar(scaleFactor);
        }

        scene.add(mesh);
    });
}

// =======================
// IMPORTAR / EXPORTAR MODELOS
// =======================
async function loadSelectedModel() {
    const select = document.getElementById('modelSelect');
    if (!select) {
        showToast("Error: Selector de modelos no encontrado");
        return;
    }

    const modelPath = select.value;
    if (!modelPath) {
        showToast("Por favor selecciona un modelo");
        return;
    }

    // Muestra loader visual
    document.body.style.cursor = "wait";
    showToast("Cargando modelo...");

    try {
        // Carga según el tipo de archivo
        if (modelPath.toLowerCase().endsWith('.obj')) {
            if (typeof THREE.OBJLoader === 'undefined') {
                throw new Error('OBJLoader no está disponible');
            }

            const loader = new THREE.OBJLoader();
            loader.load(modelPath, function (object) {
                // Asignar un ID único para el grupo importado
                const uniqueId = Date.now() + "_" + Math.floor(Math.random() * 1000);
                object.name = `ImportedModel_${uniqueId}`;
                object.userData = {
                    name: "Modelo OBJ importado",
                    type: "ImportedModel",
                    importId: uniqueId,
                    isImportedGroup: true
                };

                // Configurar cada mesh individual
                object.traverse(child => {
                    if (child.isMesh) {
                        child.material.flatShading = true;
                        child.castShadow = false;
                        child.receiveShadow = false;

                        // Asignar un ID único a cada mesh dentro del grupo
                        child.name = `ImportedMeshPart_${uniqueId}_${child.id}`;
                        child.userData = {
                            parentModelId: uniqueId,
                            isImportedMeshPart: true
                        };

                        // Asegurarse de que el mesh tenga una bounding box calculada
                        if (child.geometry) {
                            child.geometry.computeBoundingBox();
                        }
                    }
                });

                // Centrar el objeto en el origen
                const box = new THREE.Box3().setFromObject(object);
                const center = box.getCenter(new THREE.Vector3());
                object.position.sub(center);

                // Añadir a la escena
                scene.add(object);
                window.currentModel = object;
                document.body.style.cursor = "";
                showToast("Modelo OBJ cargado correctamente");
                saveState();
            },
                function (progress) {
                    console.log('Progreso de carga:', progress);
                },
                function (error) {
                    console.error('Error cargando modelo OBJ:', error);
                    showToast("Error al cargar el modelo OBJ");
                    document.body.style.cursor = "";
                });
        } else if (modelPath.toLowerCase().endsWith('.stl')) {
            if (typeof THREE.STLLoader === 'undefined') {
                throw new Error('STLLoader no está disponible');
            }

            const loader = new THREE.STLLoader();
            loader.load(modelPath, function (geometry) {
                // Función simple para generar UVs si no existe generateBoxUVs
                if (typeof generateBoxUVs === 'function') {
                    generateBoxUVs(geometry);
                } else {
                    // UV mapping básico
                    const uvs = [];
                    const positionAttribute = geometry.attributes.position;
                    for (let i = 0; i < positionAttribute.count; i++) {
                        uvs.push(0.5, 0.5); // UV básico en el centro
                    }
                    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
                }

                geometry.computeVertexNormals();
                geometry.computeBoundingBox();

                const material = new THREE.MeshStandardMaterial({
                    color: 0xcccccc,
                    flatShading: true,
                    transparent: false,
                    opacity: 1,
                    side: THREE.DoubleSide
                });

                // Crear un ID único para este mesh
                const uniqueId = Date.now() + "_" + Math.floor(Math.random() * 1000);

                const mesh = new THREE.Mesh(geometry, material);
                mesh.name = `ImportedSTL_${uniqueId}`;
                mesh.userData = {
                    name: "Modelo STL importado",
                    type: "ImportedMesh",
                    importId: uniqueId,
                    isImportedSTL: true,
                    modelPath: modelPath, // Guardar la ruta del modelo STL
                    originalScale: { x: 1, y: 1, z: 1 }
                };

                mesh.castShadow = false;
                mesh.receiveShadow = false;

                // Centrar el objeto en su geometría
                const box = new THREE.Box3().setFromObject(mesh);
                const center = box.getCenter(new THREE.Vector3());
                mesh.position.sub(center);

                scene.add(mesh);
                window.currentModel = mesh;
                document.body.style.cursor = "";
                showToast("Modelo STL cargado correctamente");
                saveState();
            },
                function (progress) {
                    console.log('Progreso de carga:', progress);
                },
                function (error) {
                    console.error('Error cargando modelo STL:', error);
                    showToast("Error al cargar el modelo STL");
                    document.body.style.cursor = "";
                });
        } else {
            throw new Error('Formato de modelo no soportado');
        }
    } catch (error) {
        console.error('Error en loadSelectedModel:', error);
        showToast("Error: " + error.message);
        document.body.style.cursor = "";
    }
}

// =======================
// DESHACER / REHACER
// =======================
/**
 * Sistema mejorado de deshacer/rehacer
 */
function undoAction() {
    if (history.length < 2) {
        showToast("No hay más acciones para deshacer");
        return;
    }

    // Mover estado actual a pila de rehacer
    redoStack.push(history.pop());

    // Restaurar estado anterior
    const previousState = history[history.length - 1];
    restoreState(previousState);

    // Actualizar botones
    updateUndoRedoButtons();

    showToast("Acción deshecha");
}

function redoAction() {
    if (redoStack.length === 0) {
        showToast("No hay acciones para rehacer");
        return;
    }

    // Restaurar estado desde pila de rehacer
    const nextState = redoStack.pop();
    history.push(nextState);
    restoreState(nextState);

    // Actualizar botones
    updateUndoRedoButtons();

    showToast("Acción rehecha");
}

// Agregar atajos de teclado para deshacer/rehacer
document.addEventListener("keydown", function (event) {
    // Ctrl+Z para deshacer
    if (event.ctrlKey && event.key === 'z' && !event.shiftKey) {
        event.preventDefault();
        undoAction();
    }
    // Ctrl+Y o Ctrl+Shift+Z para rehacer
    else if ((event.ctrlKey && event.key === 'y') ||
        (event.ctrlKey && event.shiftKey && event.key === 'Z')) {
        event.preventDefault();
        redoAction();
    }
});

document.getElementById("undoButton").addEventListener("click", undoAction);
document.getElementById("redoButton").addEventListener("click", redoAction);

// =======================
// OTRAS UTILIDADES
// =======================
function enableRotation() {
    if (!selectedObject) return alert("Selecciona un objeto para rotar.");
    attachTransformControls(selectedObject, "rotate");
}

function setView(view) {
    if (!camera) return;
    let target = new THREE.Vector3(0, 0, 0);
    if (view === 'top') {
        camera.position.set(0, 500, 0);
        camera.up.set(0, 0, -1); // Para que el eje Z quede hacia arriba en pantalla
        target.set(0, 0, 0);
    } else if (view === 'front') {
        camera.position.set(0, 0, 500);
        camera.up.set(0, 1, 0);
        target.set(0, 0, 0);
    } else if (view === 'right') {
        camera.position.set(500, 0, 0);
        camera.up.set(0, 1, 0);
        target.set(0, 0, 0);
    } else if (view === 'left') {
        camera.position.set(-500, 0, 0);
        camera.up.set(0, 1, 0);
        target.set(0, 0, 0);
    } else {
        camera.position.set(200, 200, 300);
        camera.up.set(0, 1, 0);
        target.set(0, 0, 0);
    }
    camera.lookAt(target);
    controls.target.copy(target);
    controls.update();
    saveState();
}

// =======================
// EXPORTAR IMAGEN
// =======================
let exportCamera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
exportCamera.position.set(0, 300, 500);
exportCamera.lookAt(0, 0, 0);

let menuBackCamera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
menuBackCamera.position.set(-500, 0, 0);
menuBackCamera.lookAt(0, 0, 0);

function renderScene() {
    if (!scene || !(scene instanceof THREE.Scene)) return;
    if (!renderer || !(renderer instanceof THREE.WebGLRenderer)) return;

    let objectsHidden = [];
    scene.traverse((object) => {
        if (object.type === "GridHelper" || object.type === "AxesHelper") {
            objectsHidden.push(object);
            object.visible = false;
        }
    });

    // Usa la cámara actual
    renderer.render(scene, camera);

    const imageURL = renderer.domElement.toDataURL("image/png");
    objectsHidden.forEach((object) => object.visible = true);

    const link = document.createElement("a");
    link.href = imageURL;
    link.download = "render_3D.png";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}
document.getElementById("renderSceneButton").addEventListener("click", function () {
    renderScene();
});

// Función para actualizar la posición de los controles de transformación
// y alinearlos correctamente con el objeto seleccionado
function updateTransformControlsPosition() {
    if (!selectedObject || !transformControls) return;

    // Si el objeto tiene geometría, usa su bounding box para centrar los controles
    if (selectedObject.geometry && selectedObject.geometry.boundingBox) {
        // Asegurarse de que la bounding box esté actualizada
        selectedObject.geometry.computeBoundingBox();

        // Determina el centro geométrico del objeto en espacio local
        const bbox = selectedObject.geometry.boundingBox;
        const center = new THREE.Vector3();
        bbox.getCenter(center);

        // Actualizar los controles para usar el centro geométrico del objeto
        // Esto asegura que los ejes de transformación estén alineados con el objeto
        transformControls.position.copy(center);
    }
}

// Función wrapper para adjuntar los controles y asegurarnos
// que estén correctamente posicionados
function attachTransformControls(object, mode = "translate") {
    if (!object || !transformControls) return;

    // Adjuntar los controles al objeto
    transformControls.attach(object);
    transformControls.setMode(mode);
    transformControls.visible = true;

    // Actualizar la posición de los controles
    updateTransformControlsPosition();
}

// Función para detectar y corregir problemas de escala en localStorage
function validateAndFixLocalStorage() {
    try {
        const savedState = localStorage.getItem("modula_project_state");
        if (!savedState) return;

        const state = JSON.parse(savedState);
        let hasInvalidScales = false;

        // Verificar cada objeto en el estado guardado
        state.forEach(data => {
            if (data.scale) {
                // Detectar escalas problemáticas
                if (data.scale.x < 0.01 || data.scale.y < 0.01 || data.scale.z < 0.01 ||
                    data.scale.x > 1000 || data.scale.y > 1000 || data.scale.z > 1000 ||
                    isNaN(data.scale.x) || isNaN(data.scale.y) || isNaN(data.scale.z)) {
                    console.warn("Escala inválida detectada:", data.scale, "para objeto:", data.name);
                    hasInvalidScales = true;
                    // Corregir la escala
                    data.scale = { x: 1, y: 1, z: 1 };
                }
            }
        });

        // Si encontramos escalas inválidas, guardar el estado corregido
        if (hasInvalidScales) {
            console.log("Corrigiendo escalas inválidas en localStorage");
            localStorage.setItem("modula_project_state", JSON.stringify(state));
            showToast("Se corrigieron algunas escalas de objetos al cargar");
        }

    } catch (error) {
        console.error("Error al validar localStorage:", error);
        // Si hay un error grave, limpiar localStorage
        localStorage.removeItem("modula_project_state");
        console.log("localStorage limpiado debido a errores");
    }
}

// Función para resetear escalas de todos los objetos en la escena
function resetAllScales() {
    const meshes = scene.children.filter(obj => obj.isMesh && obj.type === "Mesh");
    let resetCount = 0;

    meshes.forEach(mesh => {
        // Verificar si la escala es problemática
        if (mesh.scale.x < 0.01 || mesh.scale.y < 0.01 || mesh.scale.z < 0.01) {
            mesh.scale.set(1, 1, 1);
            resetCount++;
        }
    });

    if (resetCount > 0) {
        saveState();
        showToast(`Se resetearon las escalas de ${resetCount} objetos`);
    } else {
        showToast("No se encontraron objetos con escalas problemáticas");
    }
}

// =======================
// POBLAR SELECT DE MODELOS
// =======================
function populateModelSelect() {
    const select = document.getElementById('modelSelect');
    if (!select) {
        console.error("Elemento modelSelect no encontrado en el DOM");
        return;
    }

    select.innerHTML = ""; // Limpia opciones previas

    // Lista manual de modelos basada en los archivos disponibles
    const models = [
        { name: "Campana extractor", file: "models/campana extractor.stl" },
        { name: "Chapa palanca", file: "models/chapa palanca.stl" },
        { name: "Estufa 2 boquillas", file: "models/estufa 2 boquillas.stl" },
        { name: "Horno", file: "models/horno.stl" },
        { name: "Lavaplatos doble", file: "models/lavaplatos doble.stl" },
        { name: "Microondas", file: "models/microondas.stl" },
        { name: "Nevecon", file: "models/nevecon.stl" },
        { name: "Nevera", file: "models/nevera.stl" },
        { name: "PC", file: "models/pc.obj" },
        { name: "Perfil Aluminio C (Sistema Gola)", file: "models/perfil aluminio c (sistema gola).stl" },
        { name: "Perfil Gola", file: "models/perfil gola.stl" },
        { name: "Silla vintage Coca", file: "models/silla vintage coca.stl" },
        { name: "Tubo ovalado negro", file: "models/tubo ovalado negro.stl" },
        { name: "Wall Panel", file: "models/wall panel.stl" },
        { name: "00.1.2.Panel.Regruesado.(rev1)", file: "models/00.1.2.Panel.Regruesado.(rev1).obj" },
    ];

    models.forEach(model => {
        const option = document.createElement('option');
        option.value = model.file;
        option.textContent = model.name;
        select.appendChild(option);
    });

    console.log("✅ Selector de modelos poblado correctamente con", models.length, "modelos");
}
// =======================
// GESTIÓN DE FONDO
// =======================

// Función para cargar un Skybox desde una sola imagen o HDR/EXR
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
        } else if (["jpg", "jpeg", "png"].includes(fileExtension)) {
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

function mostrarArchivosModulo(rutaModulo) {
    const archivosDiv = document.getElementById('archivosModulo');
    archivosDiv.innerHTML = "Cargando archivos...";

    fetch(`/api/listar-archivos?path=${encodeURIComponent(rutaModulo)}`)
        .then(res => res.json())
        .then(data => {
            if (data.error) {
                archivosDiv.innerHTML = "No se pudieron leer los archivos.";
                return;
            }
            if (!data.files || data.files.length === 0) {
                archivosDiv.innerHTML = "No hay archivos en este módulo.";
                return;
            }
            archivosDiv.innerHTML = "<b>Archivos:</b><ul>" +
                data.files.map(f => `<li>${f}</li>`).join('') +
                "</ul>";
        })
        .catch(() => {
            archivosDiv.innerHTML = "No se pudieron leer los archivos.";
        });
}

// Menú tipo árbol para módulos predeterminados
function construirMenuModulos() {
    const treeDiv = document.getElementById('modulosTree');
    if (!treeDiv) return;
    treeDiv.innerHTML = '';
    // Primer nivel: carpetas dentro de modulos_predeterminados
    fetch('/api/listar-contenido?path=') 
        .then(res => res.json())
        .then(data => {
            if (!data.carpetas) return;
            data.carpetas.forEach(nombreCarpeta => {
                const carpetaDiv = document.createElement('div');
                carpetaDiv.style.marginBottom = '6px';
                carpetaDiv.innerHTML = `
                    <b style="cursor:pointer;color:#6cf;" onclick="mostrarContenidoCarpeta(this, '${nombreCarpeta}')">
                        📁 ${nombreCarpeta}
                    </b>
                    <div class="contenido-lista" style="margin-left:16px;display:none;"></div>
                `;
                treeDiv.appendChild(carpetaDiv);
            });
        });
}

// Función recursiva para mostrar contenido de una carpeta
window.mostrarContenidoCarpeta = function (el, relPath) {
    const lista = el.parentElement.querySelector('.contenido-lista');
    if (lista.style.display === 'block') {
        lista.style.display = 'none';
        lista.innerHTML = '';
        return;
    }
    lista.style.display = 'block';
    lista.innerHTML = 'Cargando...';
    fetch(`/api/listar-contenido?path=${encodeURIComponent(relPath)}`)
        .then(res => res.json())
        .then(data => {
            lista.innerHTML = '';
            // Subcarpetas
            data.carpetas.forEach(subcarpeta => {
                const subPath = relPath ? `${relPath}/${subcarpeta}` : subcarpeta;
                const subDiv = document.createElement('div');
                subDiv.innerHTML = `
                    <span class="folder-item" onclick="mostrarContenidoCarpeta(this, '${subPath}')">
                        <span class="folder-icon">📁</span>${subcarpeta}
                    </span>
                    <div class="contenido-lista" style="margin-left:16px;display:none;"></div>
                `;
                lista.appendChild(subDiv);
            });
            // Archivos
            data.archivos.forEach(archivo => {
                const fileDiv = document.createElement('div');
                fileDiv.className = 'file-item';
                fileDiv.innerHTML = `<span class="file-icon">📄</span>${archivo}`;
                fileDiv.onclick = () => cargarModuloAlProyecto('modulos_predeterminados/' + relPath + '/' + archivo);
                lista.appendChild(fileDiv);
            });
        })
        .catch(() => {
            lista.innerHTML = 'Error al cargar contenido.';
        });
};

// =======================
// MEJOR SNAP PARA METRO (tipo SketchUp)
// =======================

// Devuelve todos los vértices únicos de todos los Meshes visibles en la escena
function getAllVisibleVertices() {
    const vertices = [];
    scene.traverse(obj => {
        if (obj.isMesh && obj.visible && obj.geometry && obj.geometry.attributes && obj.geometry.attributes.position) {
            const pos = obj.geometry.attributes.position;
            for (let i = 0; i < pos.count; i++) {
                const v = new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(obj.matrixWorld);
                vertices.push(v);
            }
        }
    });
    return vertices;
}

// Encuentra el vértice más cercano a la posición del mouse en pantalla
function getClosestVertexToMouse(mouseEvent, maxScreenDist = 12) {
    const rect = renderer.domElement.getBoundingClientRect();
    const mouseX = mouseEvent.clientX - rect.left;
    const mouseY = mouseEvent.clientY - rect.top;
    let closest = null;
    let minDist = Infinity;
    getAllVisibleVertices().forEach(v => {
        const projected = v.clone().project(camera);
        const sx = (projected.x * 0.5 + 0.5) * rect.width;
        const sy = (-projected.y * 0.5 + 0.5) * rect.height;
        const dist = Math.sqrt((sx - mouseX) ** 2 + (sy - mouseY) ** 2);
        if (dist < minDist && dist < maxScreenDist) {
            minDist = dist;
            closest = v.clone();
        }
    });
    return closest;
}

// Hookea el evento de movimiento del mouse del metro para snap automático
function onMetroPointerMove(event) {
    if (!metroActive || metroPoints.length === 0) return;
    const snapVertex = getClosestVertexToMouse(event);
    let p1 = metroPoints[0];
    let p2;
    if (snapVertex) {
        p2 = snapVertex;
        renderer.domElement.style.cursor = 'crosshair';
    } else {
        // Si no hay snap, usar el punto 3D bajo el mouse (raycast plano XZ)
        const rect = renderer.domElement.getBoundingClientRect();
        const mouse = new THREE.Vector2(
            ((event.clientX - rect.left) / rect.width) * 2 - 1,
            -((event.clientY - rect.top) / rect.height) * 2 + 1
        );
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(mouse, camera);
        const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
        const intersect = new THREE.Vector3();
        raycaster.ray.intersectPlane(plane, intersect);
        p2 = intersect;
        renderer.domElement.style.cursor = 'default';
    }
    drawMetroPreview(p1, p2);
}

// Reemplaza el event listener del metro para usar el nuevo snap
function enableMetro() {
    metroActive = true;
    renderer.domElement.addEventListener('pointermove', onMetroPointerMove);
    // ...resto de la lógica de activación del metro...
}