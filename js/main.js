document.addEventListener('DOMContentLoaded', () => {
    // Selettori elementi DOM
    const projectNameInput = document.getElementById('projectName');
    const projectLocationInput = document.getElementById('projectLocation');
    const projectVersionInput = document.getElementById('projectVersion');
    const saveProjectBtn = document.getElementById('save-project-btn');
    const loadProjectInput = document.getElementById('load-project-input');
    const newProjectBtn = document.getElementById('new-project-btn');

    // --- GESTIONE METADATI PROGETTO ---
    function saveProjectMeta() {
        const metaData = {
            name: projectNameInput.value,
            location: projectLocationInput.value,
            version: projectVersionInput.value
        };
        localStorage.setItem('powerload_projectMeta', JSON.stringify(metaData));
    }

    function loadProjectMeta() {
        const metaData = JSON.parse(localStorage.getItem('powerload_projectMeta'));
        if (metaData) {
            projectNameInput.value = metaData.name || '';
            projectLocationInput.value = metaData.location || '';
            projectVersionInput.value = metaData.version || '';
        }
    }

    projectNameInput.addEventListener('input', saveProjectMeta);
    projectLocationInput.addEventListener('input', saveProjectMeta);
    projectVersionInput.addEventListener('input', saveProjectMeta);
    
    // --- GESTIONE SALVA/CARICA PROGETTO COMPLETO ---
    saveProjectBtn.addEventListener('click', () => {
        const projectData = {
            meta: JSON.parse(localStorage.getItem('powerload_projectMeta')) || {},
            materials: JSON.parse(localStorage.getItem('powerload_materials')) || [],
            switchboards: JSON.parse(localStorage.getItem('powerload_switchboards')) || [],
            setup: JSON.parse(localStorage.getItem('powerload_setup')) || []
        };

        const dataStr = JSON.stringify(projectData, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        const fileName = projectData.meta.name ? projectData.meta.name.replace(/\s+/g, '_') : 'progetto_powerload';
        a.download = `${fileName}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        alert('Progetto salvato con successo!');
    });

    loadProjectInput.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (!file) {
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const projectData = JSON.parse(e.target.result);
                
                localStorage.setItem('powerload_projectMeta', JSON.stringify(projectData.meta || {}));
                localStorage.setItem('powerload_materials', JSON.stringify(projectData.materials || []));
                localStorage.setItem('powerload_switchboards', JSON.stringify(projectData.switchboards || []));
                localStorage.setItem('powerload_setup', JSON.stringify(projectData.setup || []));

                loadProjectMeta();
                alert('Progetto caricato con successo! Naviga nelle altre pagine per vedere i dati.');

            } catch (error) {
                alert('Errore: Il file selezionato non è un file di progetto valido.');
                console.error(error);
            }
        };
        reader.readAsText(file);
        loadProjectInput.value = '';
    });

    // --- GESTIONE NUOVO PROGETTO ---
    newProjectBtn.addEventListener('click', () => {
        if (confirm('Sei sicuro di voler creare un nuovo progetto? Questo eliminerà tutti i dati del progetto corrente ma manterrà gli inventari.')) {
            // Elimina solo i dati del progetto, mantiene gli inventari
            localStorage.removeItem('powerload_projectMeta');
            localStorage.removeItem('powerload_setup');
            
            // Reset dei campi del form
            projectNameInput.value = '';
            projectLocationInput.value = '';
            projectVersionInput.value = '';
            
            alert('Nuovo progetto creato! Gli inventari sono stati mantenuti.');
        }
    });

    loadProjectMeta();
});