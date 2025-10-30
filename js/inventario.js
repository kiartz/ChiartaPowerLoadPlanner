document.addEventListener('DOMContentLoaded', () => {
    // CORREZIONE: Riattivata la chiamata per l'inventario materiali
    if (document.getElementById('material-form')) {
        initMaterialInventory();
    }
    if (document.getElementById('switchboard-form')) {
        initSwitchboardInventory();
    }
});

// ===================================================================
// LOGICA INVENTARIO MATERIALE (Completa e invariata)
// ===================================================================
function initMaterialInventory() {
    // Selettori DOM
    const materialForm = document.getElementById('material-form');
    const materialNameInput = document.getElementById('material-name');
    const materialWattsInput = document.getElementById('material-watts');
    const materialConnectionInput = document.getElementById('material-connection'); // NUOVO
    const materialListDiv = document.getElementById('material-list');
    
    // Selettori Modal
    const editModal = document.getElementById('edit-modal');
    const editMaterialForm = document.getElementById('edit-material-form');
    const editMaterialId = document.getElementById('edit-material-id');
    const editMaterialName = document.getElementById('edit-material-name');
    const editMaterialWatts = document.getElementById('edit-material-watts');
    const editMaterialConnection = document.getElementById('edit-material-connection'); // NUOVO
    const cancelEditBtn = document.getElementById('cancel-edit-btn');
    let materials = JSON.parse(localStorage.getItem('powerload_materials')) || [];
    
    // NUOVO: Selettori per import/export
    const exportBtn = document.getElementById('export-materials-btn');
    const importBtn = document.getElementById('import-materials-btn');
    const importInput = document.getElementById('import-materials-input');
    const searchInput = document.getElementById('search-material-input'); // NUOVO

    function saveData() {
        localStorage.setItem('powerload_materials', JSON.stringify(materials));
    }

    function renderMaterials() {
        materialListDiv.innerHTML = '';
        const searchTerm = searchInput.value.toLowerCase();
        const filteredMaterials = materials.filter(m => m.name.toLowerCase().includes(searchTerm));

        if (filteredMaterials.length === 0) {
            materialListDiv.innerHTML = '<p>Nessun materiale in inventario.</p>';
            if (searchTerm) materialListDiv.innerHTML = `<p>Nessun materiale trovato per "${searchInput.value}".</p>`;
            return;
        }
        filteredMaterials.forEach(material => {
            const item = document.createElement('div');
            item.className = 'inventory-item';
            item.innerHTML = `
                <span>
                    <strong>${material.name}</strong> - ${material.watts}W
                    <small style="display: block; color: var(--secondary-color);">${material.connectionType}</small>
                </span>
                <div class="item-actions">
                    <button class="edit-btn" data-id="${material.id}">Modifica</button>
                    <button class="delete-btn" data-id="${material.id}">Elimina</button>
                </div>
            `;
            materialListDiv.appendChild(item);
        });
    }
    
    function openEditModal(id) {
        const materialToEdit = materials.find(m => m.id === id);
        if (materialToEdit) {
            editMaterialId.value = materialToEdit.id;
            editMaterialName.value = materialToEdit.name;
            editMaterialWatts.value = materialToEdit.watts;
            editMaterialConnection.value = materialToEdit.connectionType; // NUOVO
            editModal.classList.remove('hidden');
        }
    }

    function closeEditModal() {
        editModal.classList.add('hidden');
    }

    materialForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const name = materialNameInput.value.trim();
        const watts = parseInt(materialWattsInput.value);
        const connectionType = materialConnectionInput ? materialConnectionInput.value : '';

        if (name && watts >= 0) {
            const newMaterial = { id: Date.now(), name, watts, connectionType };
            materials.push(newMaterial);
            saveData();
            renderMaterials();
            materialForm.reset();
        }
    });

    materialListDiv.addEventListener('click', (e) => {
        const targetButton = e.target.closest('[data-id]');
        if (!targetButton) return;
        const id = parseInt(targetButton.getAttribute('data-id'));
        if (targetButton.classList.contains('delete-btn')) {
            if (confirm('Sei sicuro di voler eliminare questo materiale?')) {
                materials = materials.filter(material => material.id !== id);
                saveData();
                renderMaterials();
            }
        }
        if (targetButton.classList.contains('edit-btn')) {
            openEditModal(id);
        }
    });

    editMaterialForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const idToUpdate = parseInt(editMaterialId.value);
        const newName = editMaterialName.value.trim();
        const newWatts = parseInt(editMaterialWatts.value);
        const newConnection = editMaterialConnection ? editMaterialConnection.value : '';

        if (newName && newWatts >= 0) {
            const materialIndex = materials.findIndex(m => m.id === idToUpdate);
            if (materialIndex !== -1) {
                materials[materialIndex].name = newName;
                materials[materialIndex].watts = newWatts;
                materials[materialIndex].connectionType = newConnection;
                saveData();
                renderMaterials();
                closeEditModal();
            }
        }
    });
    
    cancelEditBtn.addEventListener('click', closeEditModal);
    editModal.addEventListener('click', (e) => {
        if (e.target === editModal) closeEditModal();
    });
    
    editMaterialName.addEventListener('focus', (event) => event.target.select());
    editMaterialWatts.addEventListener('focus', (event) => event.target.select());

    renderMaterials();

    // -------------------------
    // Export / Import handlers
    // -------------------------
    function downloadJSON(filename, data) {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    }

    function exportMaterials() {
        const stored = JSON.parse(localStorage.getItem('powerload_materials')) || [];
        if (stored.length === 0) {
            alert('Nessun materiale da esportare.');
            return;
        }
        const projectMeta = JSON.parse(localStorage.getItem('powerload_projectMeta')) || {};
        const base = projectMeta.name ? projectMeta.name.replace(/\s+/g, '_') : 'progetto_powerload';
        const filename = `${base}_PLP_InventarioMateriale.json`;
        downloadJSON(filename, stored);
    }

    function mergeImportedMaterials(importedArray) {
        if (!Array.isArray(importedArray)) return 0;
        // Normalize and deduplicate by name+watts+connectionType
        const existingKeys = new Set(materials.map(m => `${m.name}||${m.watts}||${m.connectionType}`));
        let added = 0;
        importedArray.forEach(item => {
            if (!item || !item.name) return;
            const key = `${item.name}||${item.watts || 0}||${item.connectionType || ''}`;
            if (!existingKeys.has(key)) {
                // Ensure item has an id
                const newItem = {
                    id: Date.now() + Math.floor(Math.random() * 1000),
                    name: item.name,
                    watts: Number(item.watts) || 0,
                    connectionType: item.connectionType || ''
                };
                materials.push(newItem);
                existingKeys.add(key);
                added++;
            }
        });
        if (added > 0) {
            saveData();
            renderMaterials();
        }
        return added;
    }

    function importMaterialsFromFile(file) {
        if (!file) return;
        // Validate filename pattern: *_PLP_InventarioMateriale(.json)?
        const validPattern = /^.+_PLP_InventarioMateriale(\.json)?$/i;
        if (!validPattern.test(file.name)) {
            alert('Nome file non valido. Il file da importare deve terminare con "_PLP_InventarioMateriale".');
            return;
        }
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const json = JSON.parse(e.target.result);
                const added = mergeImportedMaterials(json);
                alert(`Importazione completata. Aggiunti ${added} materiali.`);
            } catch (err) {
                console.error(err);
                alert('File non valido. Assicurati di selezionare un file .json con un array di materiali.');
            }
        };
        reader.readAsText(file);
    }

    // Wire buttons
    if (exportBtn) exportBtn.addEventListener('click', exportMaterials);
    if (importBtn && importInput) {
        importBtn.addEventListener('click', () => importInput.click());
        importInput.addEventListener('change', (e) => {
            const file = e.target.files && e.target.files[0];
            if (file) importMaterialsFromFile(file);
            // reset input to allow re-importing the same file if needed
            importInput.value = '';
        });
    }

    // NUOVO: Event listener per la ricerca
    searchInput.addEventListener('input', renderMaterials);
}

// ===================================================================
// LOGICA INVENTARIO QUADRI (AGGIORNATA per v0.6.3)
// ===================================================================
function initSwitchboardInventory() {
    const switchboardForm = document.getElementById('switchboard-form');
    const switchboardNameInput = document.getElementById('switchboard-name');
    const switchboardInputInput = document.getElementById('switchboard-input');
    const outletsContainer = document.getElementById('outlets-container');
    const addOutletBtn = document.getElementById('add-outlet-btn');
    const switchboardListDiv = document.getElementById('switchboard-list');
    const editModal = document.getElementById('edit-switchboard-modal');
    const editSwitchboardForm = document.getElementById('edit-switchboard-form');
    const editSwitchboardId = document.getElementById('edit-switchboard-id');
    const editSwitchboardName = document.getElementById('edit-switchboard-name');
    const editSwitchboardInput = document.getElementById('edit-switchboard-input');
    const editOutletsContainer = document.getElementById('edit-outlets-container');
    const editAddOutletBtn = document.getElementById('edit-add-outlet-btn');
    const cancelEditBtn = document.getElementById('cancel-edit-switchboard-btn');
    let switchboards = JSON.parse(localStorage.getItem('powerload_switchboards')) || [];
    // Selettori import/export per i quadri
    const exportSwitchboardsBtn = document.getElementById('export-switchboards-btn');
    const importSwitchboardsBtn = document.getElementById('import-switchboards-btn');
    const importSwitchboardsInput = document.getElementById('import-switchboards-input');
    const searchInput = document.getElementById('search-switchboard-input'); // NUOVO

    function saveData() {
        localStorage.setItem('powerload_switchboards', JSON.stringify(switchboards));
    }

    function renderSwitchboards() {
        switchboardListDiv.innerHTML = '';
        const searchTerm = searchInput.value.toLowerCase();
        const filteredSwitchboards = switchboards.filter(sb => sb.name.toLowerCase().includes(searchTerm));

        if (filteredSwitchboards.length === 0) {
            switchboardListDiv.innerHTML = '<p>Nessun quadro in inventario.</p>';
            if (searchTerm) switchboardListDiv.innerHTML = `<p>Nessun quadro trovato per "${searchInput.value}".</p>`;
            return;
        }
        filteredSwitchboards.forEach(sb => {
            const item = document.createElement('div');
            item.className = 'inventory-item';
            let outletsHtml = '<ul>';
            sb.outlets.forEach((outlet, index) => {
                let phaseInfo = outlet.type.includes('Monofase') ? `(Fase: ${outlet.phase})` : outlet.type === 'Socapex' ? `(Fasi: ${outlet.phases.join(', ')})` : '(Trifase)';
                outletsHtml += `<li><strong>#${index + 1}:</strong> ${outlet.type} ${phaseInfo}</li>`;
            });
            outletsHtml += '</ul>';
            item.innerHTML = `<div><strong>${sb.name}</strong> (Input: ${sb.input})${outletsHtml}</div><div class="item-actions"><button class="edit-btn" data-id="${sb.id}">Modifica</button><button class="delete-btn" data-id="${sb.id}">Elimina</button></div>`;
            switchboardListDiv.appendChild(item);
        });
    }

    function createOutletGroupHTML() {
        const newGroupDiv = document.createElement('div');
        newGroupDiv.className = 'outlet-config card';
        newGroupDiv.innerHTML = `
            <button type="button" class="delete-btn" style="margin-bottom:10px" onclick="this.parentElement.remove()">Rimuovi Gruppo</button>
            <div style="display: flex; gap: 15px; align-items: center;">
                <div style="flex-grow: 1;">
                    <label>Tipo di Presa</label>
                    <select class="outlet-type-select">
                        <option>Monofase 220V 16A</option>
                        <option>Monofase 220V 32A</option>
                        <option>Pentapolare 380V 16A</option>
                        <option>Pentapolare 380V 32A</option>
                        <option>Pentapolare 380V 63A</option>
                        <option>Pentapolare 380V 125A</option>
                        <option>Powerlock 400A</option>
                        <option>Socapex</option>
                    </select>
                </div>
                <div class="quantity-container" style="flex-basis: 100px;">
                    <label>Quantità</label>
                    <input type="number" class="outlet-quantity" value="1" min="1" style="padding: 12px 8px; margin: 0; margin-bottom: 0;">
                </div>
            </div>
            <div class="socapex-phases-container" style="display: none; margin-top: 10px;"></div>
        `;
        const typeSelect = newGroupDiv.querySelector('.outlet-type-select');
        typeSelect.addEventListener('change', () => updateGroupUI(typeSelect));
        updateGroupUI(typeSelect);
        return newGroupDiv;
    }

    function updateGroupUI(selectElement) {
        const groupDiv = selectElement.closest('.outlet-config');
        const socapexContainer = groupDiv.querySelector('.socapex-phases-container');
        
        if (selectElement.value === 'Socapex') {
            socapexContainer.style.display = 'block';
            let phaseHtml = '<label>Imposta il pattern di fasi per questo gruppo di Socapex</label><div class="socapex-phases" style="display:grid; grid-template-columns: repeat(auto-fit, minmax(80px, 1fr)); gap: 5px;">';
            const defaultPhases = ['R', 'S', 'T', 'R', 'S', 'T'];
            for (let i = 0; i < 6; i++) {
                const phase = defaultPhases[i];
                phaseHtml += `<div><label>Ch ${i+1}</label><select class="socapex-phase-select">
                    <option value="R" ${phase === 'R' ? 'selected' : ''}>R</option>
                    <option value="S" ${phase === 'S' ? 'selected' : ''}>S</option>
                    <option value="T" ${phase === 'T' ? 'selected' : ''}>T</option>
                </select></div>`;
            }
            phaseHtml += '</div>';
            socapexContainer.innerHTML = phaseHtml;
        } else {
            socapexContainer.style.display = 'none';
        }
    }

    addOutletBtn.addEventListener('click', () => {
        outletsContainer.appendChild(createOutletGroupHTML());
    });

    switchboardForm.addEventListener('submit', (e) => {
        e.preventDefault();
        let finalOutlets = [];
        const phases = ['R', 'S', 'T'];
        
        outletsContainer.querySelectorAll('.outlet-config').forEach(groupElem => {
            const type = groupElem.querySelector('.outlet-type-select').value;
            const quantity = parseInt(groupElem.querySelector('.outlet-quantity').value);

            if (type === 'Socapex') {
                const socaPhasesPattern = Array.from(groupElem.querySelectorAll('.socapex-phase-select')).map(s => s.value);
                for (let i = 0; i < quantity; i++) {
                    finalOutlets.push({ type: 'Socapex', phases: socaPhasesPattern });
                }
            } else {
                for (let i = 0; i < quantity; i++) {
                    let outletData = { type };
                    if (type.includes('Monofase')) {
                        outletData.phase = phases[i % 3];
                    }
                    finalOutlets.push(outletData);
                }
            }
        });
        
        const newSwitchboard = {
            id: Date.now(),
            name: switchboardNameInput.value.trim(),
            input: switchboardInputInput.value,
            outlets: finalOutlets
        };
        switchboards.push(newSwitchboard);
        saveData();
        renderSwitchboards();
        switchboardForm.reset();
        outletsContainer.innerHTML = '';
    });

    // --- Logica per il MODAL di MODIFICA (dettagliata, per singola presa) ---
    function createSingleOutletHTML(outlet = null, index) {
        const outletId = `outlet-edit-${Date.now()}-${Math.random()}`;
        const newOutletDiv = document.createElement('div');
        newOutletDiv.className = 'outlet-config card';
        newOutletDiv.id = outletId;
        const selected = (type, val) => outlet && outlet.type === type ? val : '';
        newOutletDiv.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                <strong>Presa #${index}</strong>
                <button type="button" class="delete-btn" onclick="this.closest('.outlet-config').remove()">Rimuovi</button>
            </div>
            <select class="outlet-type-select">
                <option ${selected('Monofase 220V 16A', 'selected')}>Monofase 220V 16A</option>
                <option ${selected('Monofase 220V 32A', 'selected')}>Monofase 220V 32A</option>
                <option ${selected('Pentapolare 380V 16A', 'selected')}>Pentapolare 380V 16A</option>
                <option ${selected('Pentapolare 380V 32A', 'selected')}>Pentapolare 380V 32A</option>
                <option ${selected('Pentapolare 380V 63A', 'selected')}>Pentapolare 380V 63A</option>
                <option ${selected('Pentapolare 380V 125A', 'selected')}>Pentapolare 380V 125A</option>
                <option ${selected('Powerlock 400A', 'selected')}>Powerlock 400A</option>
                <option ${selected('Socapex', 'selected')}>Socapex</option>
            </select>
            <div class="phase-assignment-container"></div>`;
        const typeSelect = newOutletDiv.querySelector('.outlet-type-select');
        typeSelect.addEventListener('change', () => updatePhaseSelectorForEdit(typeSelect, null));
        updatePhaseSelectorForEdit(typeSelect, outlet);
        return newOutletDiv;
    }

    function updatePhaseSelectorForEdit(selectElement, outletData) {
        const phaseContainer = selectElement.nextElementSibling;
        const selectedType = selectElement.value;
        let phaseHtml = '';
        if (selectedType.includes('Monofase')) {
            phaseHtml = `<label>Fase</label><select class="phase-select">
                <option value="R" ${outletData && outletData.phase === 'R' ? 'selected' : ''}>R</option>
                <option value="S" ${outletData && outletData.phase === 'S' ? 'selected' : ''}>S</option>
                <option value="T" ${outletData && outletData.phase === 'T' ? 'selected' : ''}>T</option>
            </select>`;
        } else if (selectedType === 'Socapex') {
            phaseHtml = '<label>Fasi Canali 1-6</label><div class="socapex-phases" style="display:grid; grid-template-columns: repeat(auto-fit, minmax(80px, 1fr)); gap: 5px;">';
            for (let i = 0; i < 6; i++) {
                const phase = outletData && outletData.phases ? outletData.phases[i] : 'R';
                phaseHtml += `<div><label>Ch ${i+1}</label><select class="socapex-phase-select">
                    <option value="R" ${phase === 'R' ? 'selected' : ''}>R</option>
                    <option value="S" ${phase === 'S' ? 'selected' : ''}>S</option>
                    <option value="T" ${phase === 'T' ? 'selected' : ''}>T</option>
                </select></div>`;
            }
            phaseHtml += '</div>';
        }
        phaseContainer.innerHTML = phaseHtml;
    }

    switchboardListDiv.addEventListener('click', (e) => {
        const targetButton = e.target.closest('[data-id]');
        if (!targetButton) return;
        const id = parseInt(targetButton.getAttribute('data-id'));
        if (targetButton.classList.contains('delete-btn')) {
            if (confirm('Sei sicuro di voler eliminare questo quadro? Tutte le istanze nel setup saranno rimosse.')) {
                // Rimuovi il template dall'inventario
                switchboards = switchboards.filter(sb => sb.id !== id);
                saveData();

                // Rimuovi tutte le istanze e i loro discendenti dal setup (powerload_setup)
                try {
                    const workspaceItems = JSON.parse(localStorage.getItem('powerload_setup')) || [];
                    // Trova tutte le instanceId che hanno templateId === id
                    const toRemoveInstanceIds = new Set();
                    workspaceItems.forEach(item => {
                        if (item.templateId === id) toRemoveInstanceIds.add(item.instanceId);
                    });
                    // Ricorsivamente trova i discendenti
                    const findDescendants = (parentId) => {
                        workspaceItems.forEach(item => {
                            if (item.parentId && toRemoveInstanceIds.has(item.parentId)) {
                                if (!toRemoveInstanceIds.has(item.instanceId)) {
                                    toRemoveInstanceIds.add(item.instanceId);
                                    findDescendants(item.instanceId);
                                }
                            }
                        });
                    };
                    // Avvia la ricerca di discendenti
                    Array.from(toRemoveInstanceIds).forEach(pid => findDescendants(pid));

                    const filtered = workspaceItems.filter(item => !toRemoveInstanceIds.has(item.instanceId));
                    localStorage.setItem('powerload_setup', JSON.stringify(filtered));
                } catch (err) {
                    console.error('Errore rimuovendo istanze dal setup:', err);
                }

                // trigger render per pagine che leggono setup (se sono caricate)
                try { if (typeof renderWorkspace === 'function') renderWorkspace(); } catch (e) {}
                try { if (window.location.pathname && window.location.pathname.includes('report.html')) {
                    if (typeof window.renderReport === 'function') window.renderReport();
                }} catch (e) {}

                renderSwitchboards();
            }
        } else if (targetButton.classList.contains('edit-btn')) {
            const sbToEdit = switchboards.find(sb => sb.id === id);
            if (sbToEdit) {
                editSwitchboardId.value = sbToEdit.id;
                editSwitchboardName.value = sbToEdit.name;
                editSwitchboardInput.value = sbToEdit.input;
                editOutletsContainer.innerHTML = '';
                sbToEdit.outlets.forEach((outlet, index) => {
                    editOutletsContainer.appendChild(createSingleOutletHTML(outlet, index + 1));
                });
                editModal.classList.remove('hidden');
            }
        }
    });
    
    editAddOutletBtn.addEventListener('click', () => {
        const newIndex = editOutletsContainer.children.length + 1;
        editOutletsContainer.appendChild(createSingleOutletHTML(null, newIndex));
    });

    editSwitchboardForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const idToUpdate = parseInt(editSwitchboardId.value);
        const sbIndex = switchboards.findIndex(sb => sb.id === idToUpdate);
        if (sbIndex !== -1) {
            const outlets = [];
            editOutletsContainer.querySelectorAll('.outlet-config').forEach(elem => {
                const type = elem.querySelector('.outlet-type-select').value;
                let data = { type };
                if (type.includes('Monofase')) {
                    data.phase = elem.querySelector('.phase-select').value;
                } else if (type === 'Socapex') {
                    data.phases = Array.from(elem.querySelectorAll('.socapex-phase-select')).map(s => s.value);
                }
                outlets.push(data);
            });
            switchboards[sbIndex] = {
                id: idToUpdate,
                name: editSwitchboardName.value.trim(),
                input: editSwitchboardInput.value,
                outlets
            };
            saveData();
            renderSwitchboards();
            editModal.classList.add('hidden');
        }
    });

    cancelEditBtn.addEventListener('click', () => editModal.classList.add('hidden'));
    editModal.addEventListener('click', (e) => {
        if (e.target === editModal) editModal.classList.add('hidden');
    });

    renderSwitchboards();

    // -------------------------
    // Export / Import handlers - Switchboards
    // -------------------------
    function exportSwitchboards() {
        const stored = JSON.parse(localStorage.getItem('powerload_switchboards')) || [];
        if (stored.length === 0) {
            alert('Nessun quadro da esportare.');
            return;
        }
        const projectMeta = JSON.parse(localStorage.getItem('powerload_projectMeta')) || {};
        const base = projectMeta.name ? projectMeta.name.replace(/\s+/g, '_') : 'progetto_powerload';
        const filename = `${base}_PLP_InventarioQuadri.json`;
        if (typeof downloadJSON === 'function') {
            downloadJSON(filename, stored);
            return;
        }
        const blob = new Blob([JSON.stringify(stored, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    }

    function signatureForSwitchboard(sb) {
        // Create a stable signature for deduping: name|input|outlets-json
        const outletsSig = JSON.stringify(sb.outlets || []);
        return `${sb.name}||${sb.input}||${outletsSig}`;
    }

    function mergeImportedSwitchboards(importedArray) {
        if (!Array.isArray(importedArray)) return 0;
        const existing = new Set(switchboards.map(s => signatureForSwitchboard(s)));
        let added = 0;
        importedArray.forEach(item => {
            if (!item || !item.name) return;
            const sig = signatureForSwitchboard(item);
            if (!existing.has(sig)) {
                const newItem = {
                    id: Date.now() + Math.floor(Math.random() * 1000),
                    name: item.name,
                    input: item.input || '',
                    outlets: Array.isArray(item.outlets) ? item.outlets : []
                };
                switchboards.push(newItem);
                existing.add(sig);
                added++;
            }
        });
        if (added > 0) {
            localStorage.setItem('powerload_switchboards', JSON.stringify(switchboards));
            renderSwitchboards();
        }
        return added;
    }

    function importSwitchboardsFromFile(file) {
        if (!file) return;
        const validPattern = /^.+_PLP_InventarioQuadri(\.json)?$/i;
        if (!validPattern.test(file.name)) {
            alert('Nome file non valido. Il file da importare deve terminare con "_PLP_InventarioQuadri".');
            return;
        }
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const json = JSON.parse(e.target.result);
                const added = mergeImportedSwitchboards(json);
                alert(`Importazione completata. Aggiunti ${added} quadri.`);
            } catch (err) {
                console.error(err);
                alert('File non valido. Assicurati di selezionare un file .json con un array di quadri.');
            }
        };
        reader.readAsText(file);
    }

    if (exportSwitchboardsBtn) exportSwitchboardsBtn.addEventListener('click', exportSwitchboards);
    if (importSwitchboardsBtn && importSwitchboardsInput) {
        importSwitchboardsBtn.addEventListener('click', () => importSwitchboardsInput.click());
        importSwitchboardsInput.addEventListener('change', (e) => {
            const file = e.target.files && e.target.files[0];
            if (file) importSwitchboardsFromFile(file);
            importSwitchboardsInput.value = '';
        });
    }

    // NUOVO: Event listener per la ricerca
    searchInput.addEventListener('input', renderSwitchboards);
}