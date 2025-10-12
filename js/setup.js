document.addEventListener('DOMContentLoaded', () => {

    const OUTLET_CAPACITY_WATTS = {
        '16A': 3680,
        '32A': 7360,
        '63A': 14490,
        '125A': 28750,
        '400A': 92000,
        'Socapex': 3680
    };

    const INPUT_CAPACITY_AMPS = {
        'CEE 16A 5p': 16,
        'CEE 32A 5p': 32,
        'CEE 63A 5p': 63,
        'CEE 125A 5p': 125,
        'Powerlock 400A': 400
    };

    const OUTLET_TO_INPUT_MAPPING = {
        'Pentapolare 380V 16A': 'CEE 16A 5p',
        'Pentapolare 380V 32A': 'CEE 32A 5p',
        'Pentapolare 380V 63A': 'CEE 63A 5p',
        'Pentapolare 380V 125A': 'CEE 125A 5p',
        'Powerlock 400A': 'Powerlock 400A'
    };

    let materials = JSON.parse(localStorage.getItem('powerload_materials')) || [];
    const switchboards = JSON.parse(localStorage.getItem('powerload_switchboards')) || [];
    let workspaceItems = JSON.parse(localStorage.getItem('powerload_setup')) || [];

    const addSwitchboardBtn = document.getElementById('add-switchboard-btn');
    const workspaceDiv = document.getElementById('workspace');
    const addSwModal = document.getElementById('add-switchboard-modal');
    const inventorySwList = document.getElementById('inventory-switchboard-list');
    const cancelAddSwBtn = document.getElementById('cancel-add-sw-btn');
    const quickAddMaterialModal = document.getElementById('quick-add-material-modal');
    const quickAddMaterialForm = document.getElementById('quick-add-material-form');
    const quickMaterialNameInput = document.getElementById('quick-material-name');
    const quickMaterialWattsInput = document.getElementById('quick-material-watts');
    const cancelQuickAddBtn = document.getElementById('cancel-quick-add-btn');

    function saveData() {
        localStorage.setItem('powerload_setup', JSON.stringify(workspaceItems));
    }
    function saveMaterials() {
        localStorage.setItem('powerload_materials', JSON.stringify(materials));
    }
    function removeActivePopover() {
        const existingPopover = document.querySelector('.add-load-popover');
        if (existingPopover) existingPopover.remove();
    }

    function renderWorkspace() {
        workspaceDiv.innerHTML = '';
        const topLevelItems = workspaceItems.filter(item => !item.parentId);
        topLevelItems.forEach(item => {
            const boardElement = renderBoard(item);
            workspaceDiv.appendChild(boardElement);
        });
        calculateAllTotals();
    }

    function renderBoard(item) {
        const swTemplate = switchboards.find(s => s.id === item.templateId);
        if (!swTemplate) return document.createElement('div');

        const swCard = document.createElement('div');
        swCard.className = 'card switchboard-instance';
        swCard.dataset.instanceId = item.instanceId;
        
        // NUOVO: Aggiungiamo il pulsante di "unlink" solo se il quadro è un figlio
        let actionButtons = `<button class="delete-sw-btn" data-instance-id="${item.instanceId}" title="Elimina questo quadro">×</button>`;
        if (item.parentId) {
            actionButtons += `<button class="unlink-sw-btn" data-instance-id="${item.instanceId}" title="Scollega questo quadro">&#8602;</button>`;
        }

        let outletsHtml = '';
        swTemplate.outlets.forEach((outlet, outletIndex) => {
            const identifier = item.instanceIdentifier || 'Q';
            const baseKey = `${outletIndex}-0`;

            const childBoard = workspaceItems.find(child => child.parentId === item.instanceId && child.parentOutletKey === baseKey);

            if (childBoard) {
                const childContainer = document.createElement('div');
                childContainer.className = 'child-switchboard-container';
                const childElement = renderBoard(childBoard);
                childContainer.appendChild(childElement);
                outletsHtml += `
                    <div class="outlet-row">
                        <div class="outlet-info">#${identifier}-${outletIndex + 1}: ${outlet.type}</div>
                        <div class="outlet-loads">${childContainer.outerHTML}</div>
                    </div>`;
            } else {
                if (outlet.type === 'Socapex') {
                    let socapexChannelsHtml = '';
                    const socaIdentifier = (item.socapexIds && item.socapexIds[outletIndex]) || (outletIndex + 1);

                    for (let channelIndex = 0; channelIndex < 6; channelIndex++) {
                        const compositeKey = `${outletIndex}-${channelIndex}`;
                        const loadsOnChannel = item.loads[compositeKey] || [];
                        let loadsHtml = '';
                        let channelTotalWatts = 0;
                        
                        loadsOnChannel.forEach((load, loadIndex) => {
                            const material = materials.find(m => m.id === load.materialId);
                            if (material) {
                                const groupTotalWatts = load.quantity * material.watts;
                                channelTotalWatts += groupTotalWatts;
                                const lineNameDisplay = load.lineName 
                                    ? `<span class="line-name-display" data-instance-id="${item.instanceId}" data-load-key="${compositeKey}" data-load-index="${loadIndex}">${load.lineName}</span>`
                                    : `<span class="line-name-display placeholder" data-instance-id="${item.instanceId}" data-load-key="${compositeKey}" data-load-index="${loadIndex}">ID Utenza</span>`;
                                loadsHtml += `
                                    <span class="load-pill">
                                        ${lineNameDisplay}
                                        <input type="number" class="quantity-input" value="${load.quantity}" min="1" data-instance-id="${item.instanceId}" data-load-key="${compositeKey}" data-load-index="${loadIndex}">
                                        <span>x </span><span class="load-name" data-instance-id="${item.instanceId}" data-load-key="${compositeKey}" data-load-index="${loadIndex}">${material.name} <span class="load-group-total">(${groupTotalWatts}W)</span></span>
                                        <button class="delete-load-btn" data-instance-id="${item.instanceId}" data-load-key="${compositeKey}" data-load-index="${loadIndex}">×</button>
                                    </span>`;
                            }
                        });
                        
                        let warningClass = '';
                        if (channelTotalWatts > 0) {
                            let capacity = OUTLET_CAPACITY_WATTS['Socapex'];
                            let loadPercentage = (channelTotalWatts / capacity) * 100;
                            if (loadPercentage > 95) warningClass = 'outlet-danger';
                            else if (loadPercentage > 80) warningClass = 'outlet-warning';
                            else warningClass = 'outlet-safe';
                        }

                        const finalSocaId = socaIdentifier || (outletIndex + 1);
                        socapexChannelsHtml += `
                            <div class="outlet-row socapex-channel-row ${warningClass}">
                                <div class="outlet-info">↳ #${identifier}-${finalSocaId}.${channelIndex + 1} (Fase ${outlet.phases[channelIndex]})</div>
                                <div class="outlet-loads">${loadsHtml}</div>
                                <div class="outlet-total-watts">${channelTotalWatts}W</div>
                                <div class="outlet-actions">
                                    <button class="add-load-btn-quick" data-instance-id="${item.instanceId}" data-outlet-index="${outletIndex}" data-channel-index="${channelIndex}">+</button>
                                </div>
                            </div>`;
                    }
                    
                    const socaIdValue = (item.socapexIds && item.socapexIds[outletIndex]) || '';
                    outletsHtml += `
                        <div class="socapex-group">
                            <div class="socapex-header">
                                <span>Uscita #${outletIndex + 1}: ${outlet.type}</span>
                                <input type="text" class="socapex-identifier-input" data-instance-id="${item.instanceId}" data-outlet-index="${outletIndex}" value="${socaIdValue}" placeholder="ID Soca (es. A)">
                            </div>
                            ${socapexChannelsHtml}
                        </div>`;
                } else {
                    const compositeKey = `${outletIndex}-0`;
                    const loadsOnOutlet = item.loads[compositeKey] || [];
                    let loadsHtml = '';
                    let outletTotalWatts = 0;
                    
                    loadsOnOutlet.forEach((load, loadIndex) => {
                        const material = materials.find(m => m.id === load.materialId);
                        if(material) {
                           const groupTotalWatts = load.quantity * material.watts;
                            outletTotalWatts += groupTotalWatts;
                            const lineNameDisplay = load.lineName ? `<span class="line-name-display" data-instance-id="${item.instanceId}" data-load-key="${compositeKey}" data-load-index="${loadIndex}">${load.lineName}</span>` : `<span class="line-name-display placeholder" data-instance-id="${item.instanceId}" data-load-key="${compositeKey}" data-load-index="${loadIndex}">ID Utenza</span>`;
                            loadsHtml += `
                                <span class="load-pill">
                                    ${lineNameDisplay}
                                    <input type="number" class="quantity-input" value="${load.quantity}" min="1" data-instance-id="${item.instanceId}" data-load-key="${compositeKey}" data-load-index="${loadIndex}">
                                    <span>x </span><span class="load-name" data-instance-id="${item.instanceId}" data-load-key="${compositeKey}" data-load-index="${loadIndex}">${material.name} <span class="load-group-total">(${groupTotalWatts}W)</span></span>
                                    <button class="delete-load-btn" data-instance-id="${item.instanceId}" data-load-key="${compositeKey}" data-load-index="${loadIndex}">×</button>
                                </span>`;
                        }
                    });

                    let warningClass = '';
                    if (outletTotalWatts > 0) {
                        let capacityKey = Object.keys(OUTLET_CAPACITY_WATTS).find(key => outlet.type.includes(key));
                        let maxWatts = OUTLET_CAPACITY_WATTS[capacityKey] || Infinity;
                        let loadToCheck = outletTotalWatts;
                        if (outlet.type.includes('Pentapolare') || outlet.type.includes('Powerlock')) {
                            loadToCheck = outletTotalWatts / 3;
                        }
                        let loadPercentage = (loadToCheck / maxWatts) * 100;
                        if (loadPercentage > 95) warningClass = 'outlet-danger';
                        else if (loadPercentage > 80) warningClass = 'outlet-warning';
                        else warningClass = 'outlet-safe';
                    }

                    outletsHtml += `
                        <div class="outlet-row ${warningClass}">
                            <div class="outlet-info">#${identifier}-${outletIndex + 1}: ${outlet.type}</div>
                            <div class="outlet-loads">${loadsHtml}</div>
                            <div class="outlet-total-watts">${outletTotalWatts}W</div>
                            <div class="outlet-actions">
                                <button class="add-load-btn-quick" data-instance-id="${item.instanceId}" data-outlet-index="${outletIndex}">+</button>
                            </div>
                        </div>`;
                }
            }
        });
        
        const headerHtml = `<div class="instance-header"><span class="template-name">${swTemplate.name}</span><input type="text" class="instance-name-input" data-instance-id="${item.instanceId}" value="${item.instanceName || ''}" placeholder="Nome Specifico (es. Palco Luci)"><input type="text" class="instance-identifier-input" data-instance-id="${item.instanceId}" value="${item.instanceIdentifier || ''}" placeholder="ID (es. P1)"></div>`;
        
        // MODIFICA: Utilizza la variabile actionButtons che include il pulsante condizionale
        swCard.innerHTML = `${actionButtons}${headerHtml}<div class="phase-totals"><div id="phase-r-${item.instanceId}"><strong>R:</strong> 0W / 0A</div><div id="phase-s-${item.instanceId}"><strong>S:</strong> 0W / 0A</div><div id="phase-t-${item.instanceId}"><strong>T:</strong> 0W / 0A</div></div><div class="outlets-container">${outletsHtml}</div>`;
        
        return swCard;
    }

    function calculateAllTotals() {
        workspaceItems.forEach(item => {
            item.directPhaseTotals = calculateDirectLoads(item);
        });
        const topLevelItems = workspaceItems.filter(item => !item.parentId);
        topLevelItems.forEach(item => {
            const finalTotals = calculateRecursiveTotals(item);
            updateTotalsUI(item.instanceId, finalTotals);
        });
    }

    function calculateDirectLoads(item) {
        const swTemplate = switchboards.find(s => s.id === item.templateId);
        let phaseTotals = { R: { watts: 0 }, S: { watts: 0 }, T: { watts: 0 } };
        if (!swTemplate) return phaseTotals;

        Object.keys(item.loads).forEach(loadKey => {
            const [outletIndex, channelIndex] = loadKey.split('-').map(Number);
            const outlet = swTemplate.outlets[outletIndex];
            if (!outlet) return;
            const loads = item.loads[loadKey] || [];
            loads.forEach(load => {
                const material = materials.find(m => m.id === load.materialId);
                if (!material) return;
                const totalWattsForLoad = material.watts * load.quantity;
                if (outlet.type === 'Socapex') {
                    const channelPhase = outlet.phases[channelIndex];
                    phaseTotals[channelPhase].watts += totalWattsForLoad;
                } else if (outlet.type.includes('Monofase')) {
                    phaseTotals[outlet.phase].watts += totalWattsForLoad;
                } else { 
                    phaseTotals.R.watts += totalWattsForLoad / 3;
                    phaseTotals.S.watts += totalWattsForLoad / 3;
                    phaseTotals.T.watts += totalWattsForLoad / 3;
                }
            });
        });
        return phaseTotals;
    }

    function calculateRecursiveTotals(item) {
        let aggregatedTotals = JSON.parse(JSON.stringify(item.directPhaseTotals));
        const children = workspaceItems.filter(child => child.parentId === item.instanceId);

        children.forEach(child => {
            const childTotals = calculateRecursiveTotals(child);
            aggregatedTotals.R.watts += childTotals.R.watts;
            aggregatedTotals.S.watts += childTotals.S.watts;
            aggregatedTotals.T.watts += childTotals.T.watts;
        });

        if (item.parentId) {
            updateTotalsUI(item.instanceId, aggregatedTotals);
        }
        return aggregatedTotals;
    }

    function updateTotalsUI(instanceId, totals) {
        const voltage = 230;
        const phaseRDiv = document.getElementById(`phase-r-${instanceId}`);
        const phaseSDiv = document.getElementById(`phase-s-${instanceId}`);
        const phaseTDiv = document.getElementById(`phase-t-${instanceId}`);
        if (!phaseRDiv || !phaseSDiv || !phaseTDiv) return;

        const swInstance = workspaceItems.find(item => item.instanceId === instanceId);
        if (!swInstance) return;

        const swTemplate = switchboards.find(s => s.id === swInstance.templateId);
        const maxAmps = swTemplate ? INPUT_CAPACITY_AMPS[swTemplate.input] || Infinity : Infinity;
        
        const applyWarningClass = (element, amps) => {
            element.className = '';
            if (amps > 0) {
                const loadPercentage = (amps / maxAmps) * 100;
                if (loadPercentage > 95) element.classList.add('phase-danger');
                else if (loadPercentage > 80) element.classList.add('phase-warning');
                else element.classList.add('phase-safe');
            }
        };

        const ampsR = totals.R.watts / voltage;
        phaseRDiv.innerHTML = `<strong>R:</strong> ${totals.R.watts.toFixed(0)}W / ${ampsR.toFixed(2)}A`;
        applyWarningClass(phaseRDiv, ampsR);

        const ampsS = totals.S.watts / voltage;
        phaseSDiv.innerHTML = `<strong>S:</strong> ${totals.S.watts.toFixed(0)}W / ${ampsS.toFixed(2)}A`;
        applyWarningClass(phaseSDiv, ampsS);

        const ampsT = totals.T.watts / voltage;
        phaseTDiv.innerHTML = `<strong>T:</strong> ${totals.T.watts.toFixed(0)}W / ${ampsT.toFixed(2)}A`;
        applyWarningClass(phaseTDiv, ampsT);
    }
    
    // MODIFICA: La funzione ora accetta l'ID del quadro "padre" per evitare di mostrarlo come collegabile
    function showLoadPopover(anchorElement, outletType, parentInstanceId, onSelect) {
        removeActivePopover();
        const popover = document.createElement('div');
        popover.className = 'add-load-popover';
        
        // NUOVO: Aggiunta una sezione per i quadri esistenti
        popover.innerHTML = `
            <div class="popover-section-header">Materiali compatibili</div>
            <input type="text" class="popover-search" placeholder="Cerca materiale...">
            <div class="popover-results-materials"></div>
            <button class="quick-add-material-btn">+</button>
            <div class="popover-section-header">Nuovi Quadri dall'Inventario</div>
            <div class="popover-results-switchboards"></div>
            <div class="popover-section-header">Sposta Quadro Esistente</div>
            <div class="popover-results-existing-switchboards"></div>
        `;
        anchorElement.appendChild(popover);
        
        const searchInput = popover.querySelector('.popover-search');
        const resultsMaterialsDiv = popover.querySelector('.popover-results-materials');
        const resultsSwitchboardsDiv = popover.querySelector('.popover-results-switchboards');
        const resultsExistingSwitchboardsDiv = popover.querySelector('.popover-results-existing-switchboards'); // NUOVO
        searchInput.focus();

        const renderMaterials = (filter) => {
            resultsMaterialsDiv.innerHTML = '';
            materials
                .filter(m => m.name.toLowerCase().includes(filter.toLowerCase()) && m.connectionType === outletType)
                .forEach(m => {
                    const resItem = document.createElement('div');
                    resItem.className = 'inventory-item';
                    resItem.textContent = `${m.name} (${m.watts}W)`;
                    resItem.dataset.materialId = m.id;
                    resultsMaterialsDiv.appendChild(resItem);
                });
        };

        const renderSwitchboards = () => {
            resultsSwitchboardsDiv.innerHTML = '';
            const requiredInputType = OUTLET_TO_INPUT_MAPPING[outletType];
            
            switchboards
                .filter(sw => sw.input === requiredInputType)
                .forEach(sw => {
                    const resItem = document.createElement('div');
                    resItem.className = 'inventory-item';
                    resItem.textContent = `Quad: ${sw.name}`;
                    resItem.dataset.switchboardId = sw.id;
                    resultsSwitchboardsDiv.appendChild(resItem);
                });
        };

        // NUOVA FUNZIONE per renderizzare i quadri esistenti e spostabili
        const renderExistingSwitchboards = () => {
            resultsExistingSwitchboardsDiv.innerHTML = '';
            const requiredInputType = OUTLET_TO_INPUT_MAPPING[outletType];

            // Filtra solo i quadri "radice" (non già figli di altri) e che non siano il quadro padre stesso.
            const movableItems = workspaceItems.filter(item => 
                !item.parentId && item.instanceId !== parentInstanceId
            );

            movableItems.forEach(item => {
                const template = switchboards.find(sw => sw.id === item.templateId);
                if (template && template.input === requiredInputType) {
                    const resItem = document.createElement('div');
                    resItem.className = 'inventory-item';
                    
                    // Mostra più info per rendere il quadro riconoscibile
                    let displayText = template.name;
                    if (item.instanceName) displayText += ` (${item.instanceName})`;
                    if (item.instanceIdentifier) displayText += ` - ID: ${item.instanceIdentifier}`;

                    resItem.textContent = displayText;
                    resItem.dataset.instanceIdToMove = item.instanceId; // Attributo custom per l'azione di spostamento
                    resultsExistingSwitchboardsDiv.appendChild(resItem);
                }
            });

             if (resultsExistingSwitchboardsDiv.innerHTML === '') {
                resultsExistingSwitchboardsDiv.innerHTML = '<p style="font-size: 12px; text-align: center; color: var(--secondary-color); padding: 5px;">Nessun quadro compatibile da spostare.</p>';
            }
        };

        renderMaterials('');
        renderSwitchboards();
        renderExistingSwitchboards(); // NUOVO
        searchInput.addEventListener('input', () => renderMaterials(searchInput.value));

        popover.addEventListener('click', (ev) => {
            const materialItem = ev.target.closest('[data-material-id]');
            const switchboardItem = ev.target.closest('[data-switchboard-id]');
            const existingSwitchboardItem = ev.target.closest('[data-instance-id-to-move]'); // NUOVO

            if (materialItem) {
                const materialId = parseInt(materialItem.dataset.materialId);
                onSelect({ isMaterial: true, id: materialId });
                removeActivePopover();
            }
            if (switchboardItem) {
                const switchboardId = parseInt(switchboardItem.dataset.switchboardId);
                onSelect({ isSwitchboard: true, id: switchboardId });
                removeActivePopover();
            }
            // NUOVO: Gestisce il click su un quadro da spostare
            if (existingSwitchboardItem) {
                const instanceIdToMove = parseInt(existingSwitchboardItem.dataset.instanceIdToMove);
                onSelect({ isMove: true, instanceId: instanceIdToMove });
                removeActivePopover();
            }
        });
    }

    addSwitchboardBtn.addEventListener('click', () => {
        inventorySwList.innerHTML = '';
        switchboards.forEach(sw => {
            const swItem = document.createElement('div');
            swItem.className = 'inventory-item';
            swItem.textContent = `${sw.name} (Input: ${sw.input})`;
            swItem.style.cursor = 'pointer';
            swItem.dataset.id = sw.id;
            inventorySwList.appendChild(swItem);
        });
        addSwModal.classList.remove('hidden');
    });

    inventorySwList.addEventListener('click', (e) => {
        if (e.target.matches('.inventory-item')) {
            const templateId = parseInt(e.target.dataset.id);
            const newInstance = { instanceId: Date.now(), templateId, instanceName: '', instanceIdentifier: '', socapexIds: {}, loads: {} };
            workspaceItems.push(newInstance);
            saveData();
            renderWorkspace();
            addSwModal.classList.add('hidden');
        }
    });
    
    cancelAddSwBtn.addEventListener('click', () => addSwModal.classList.add('hidden'));

    workspaceDiv.addEventListener('click', (e) => {
        const target = e.target;
        if (target.matches('.delete-sw-btn')) {
            const instanceId = parseInt(target.dataset.instanceId);
            if (confirm('Sei sicuro di voler eliminare questo quadro e tutti i suoi contenuti dal setup?')) {
                const descendants = [];
                const findDescendants = (parentId) => {
                    const children = workspaceItems.filter(item => item.parentId === parentId);
                    children.forEach(child => {
                        descendants.push(child.instanceId);
                        findDescendants(child.instanceId);
                    });
                };
                findDescendants(instanceId);
                
                const idsToRemove = [instanceId, ...descendants];
                workspaceItems = workspaceItems.filter(item => !idsToRemove.includes(item.instanceId));

                saveData();
                renderWorkspace();
            }
        }

        // NUOVO: Aggiungi questo blocco per gestire l'unlink
        if (target.matches('.unlink-sw-btn')) {
            const instanceId = parseInt(target.dataset.instanceId);
            const swInstance = workspaceItems.find(item => item.instanceId === instanceId);
            if (swInstance) {
                // Rimuoviamo i collegamenti al genitore
                delete swInstance.parentId;
                delete swInstance.parentOutletKey;
                saveData();
                renderWorkspace();
            }
        }
        if (target.matches('.add-load-btn-quick')) {
            const instanceId = parseInt(target.dataset.instanceId); // MODIFICA: Convertito in intero subito
            const { outletIndex, channelIndex } = target.dataset;
            const swInstance = workspaceItems.find(item => item.instanceId === instanceId);
            const swTemplate = switchboards.find(s => s.id === swInstance.templateId);
            
            let outletTypeForFilter = channelIndex !== undefined ? 'Monofase 220V 16A' : swTemplate.outlets[outletIndex].type;

            // MODIFICA: Passiamo l'ID del quadro padre al popover
            showLoadPopover(target.parentElement, outletTypeForFilter, instanceId, (selection) => {
                
                // NUOVO: Logica per spostare un quadro esistente
                if (selection.isMove) {
                    const childToMove = workspaceItems.find(item => item.instanceId === selection.instanceId);
                    if (childToMove) {
                        childToMove.parentId = swInstance.instanceId;
                        childToMove.parentOutletKey = `${outletIndex}-0`;
                        saveData();
                        renderWorkspace();
                    }
                } else if (selection.isSwitchboard) { // MODIFICA: Gestione standard per nuovo quadro
                    const newInstance = {
                        instanceId: Date.now(),
                        templateId: selection.id,
                        parentId: swInstance.instanceId,
                        parentOutletKey: `${outletIndex}-0`,
                        instanceName: '', instanceIdentifier: '', socapexIds: {}, loads: {}
                    };
                    workspaceItems.push(newInstance);
                    saveData();
                    renderWorkspace();
                } else { // MODIFICA: Gestione standard per materiale
                    const materialId = selection.id;
                    const loadKey = channelIndex !== undefined ? `${outletIndex}-${channelIndex}` : `${outletIndex}-0`;
                    if (!swInstance.loads[loadKey]) swInstance.loads[loadKey] = [];
                    const existingLoad = swInstance.loads[loadKey].find(load => load.materialId === materialId);
                    let loadIndex;
                    if (existingLoad) {
                        existingLoad.quantity++;
                        loadIndex = swInstance.loads[loadKey].findIndex(load => load.materialId === materialId);
                    } else {
                        swInstance.loads[loadKey].push({ materialId, quantity: 1, lineName: '' });
                        loadIndex = swInstance.loads[loadKey].length - 1; 
                    }
                    saveData();
                    renderWorkspace();
                    const targetInput = workspaceDiv.querySelector(`.quantity-input[data-instance-id="${instanceId}"][data-load-key="${loadKey}"][data-load-index="${loadIndex}"]`);
                    if (targetInput) {
                        targetInput.focus();
                        targetInput.select();
                    }
                }
            });
        }
        if (target.matches('.delete-load-btn')) {
            const { instanceId, loadKey, loadIndex } = target.dataset;
            const swInstance = workspaceItems.find(item => item.instanceId == instanceId);
            if (swInstance) {
                swInstance.loads[loadKey].splice(loadIndex, 1);
                saveData();
                renderWorkspace();
            }
        }
        if (target.matches('.line-name-display')) {
            const { instanceId, loadKey, loadIndex } = target.dataset;
            const originalValue = target.textContent === 'ID Utenza' ? '' : target.textContent;
            const input = document.createElement('input');
            input.type = 'text';
            input.className = 'line-name-input';
            input.value = originalValue;
            input.dataset.instanceId = instanceId;
            input.dataset.loadKey = loadKey;
            input.dataset.loadIndex = loadIndex;
            target.replaceWith(input);
            input.focus();
            const saveLineName = () => {
                const swInstance = workspaceItems.find(item => item.instanceId == instanceId);
                if (swInstance) {
                    swInstance.loads[loadKey][loadIndex].lineName = input.value.trim();
                    saveData();
                    renderWorkspace();
                }
            };
            input.addEventListener('blur', saveLineName);
            input.addEventListener('keydown', (ev) => {
                if (ev.key === 'Enter') input.blur();
                else if (ev.key === 'Escape') renderWorkspace();
            });
        }
        if (target.matches('.load-name')) {
            const { instanceId, loadKey, loadIndex } = target.dataset;
            const swInstance = workspaceItems.find(item => item.instanceId == instanceId);
            if (!swInstance) return;
            const swTemplate = switchboards.find(s => s.id === swInstance.templateId);
            const outletIndex = parseInt(loadKey.split('-')[0]);
            const channelIndex = loadKey.split('-')[1] !== '0' ? parseInt(loadKey.split('-')[1]) : undefined;
            
            let outletTypeForFilter = channelIndex !== undefined ? 'Monofase 220V 16A' : swTemplate.outlets[outletIndex].type;
            
            showLoadPopover(target.parentElement, outletTypeForFilter, parseInt(instanceId), (selection) => {
                if (selection.isSwitchboard || selection.isMove) return; // Non facciamo nulla se viene selezionato un quadro qui
                const newMaterialId = selection.id;
                const swInstance = workspaceItems.find(item => item.instanceId == instanceId);
                if (swInstance) {
                    swInstance.loads[loadKey][loadIndex].materialId = newMaterialId;
                    saveData();
                    renderWorkspace();
                }
            });
        }
        if (target.matches('.quick-add-material-btn')) {
            quickAddMaterialModal.classList.remove('hidden');
        }
    });
    
    workspaceDiv.addEventListener('change', (e) => {
        if (e.target.matches('.quantity-input')) {
            const { instanceId, loadKey, loadIndex } = e.target.dataset;
            const newValue = parseInt(e.target.value);
            const swInstance = workspaceItems.find(item => item.instanceId == instanceId);
            if (swInstance && newValue > 0) {
                swInstance.loads[loadKey][loadIndex].quantity = newValue;
                saveData();
                renderWorkspace();
            } else if (swInstance && (newValue <= 0 || isNaN(newValue))) {
                swInstance.loads[loadKey].splice(loadIndex, 1);
                saveData();
                renderWorkspace();
            }
        }
    });

    workspaceDiv.addEventListener('input', (e) => {
        const target = e.target;
        const instanceId = parseInt(target.dataset.instanceId);
        const swInstance = workspaceItems.find(item => item.instanceId === instanceId);
        if (!swInstance) return;
        if (target.matches('.instance-name-input')) {
            swInstance.instanceName = target.value;
            saveData();
        }
        if (target.matches('.instance-identifier-input')) {
            swInstance.instanceIdentifier = target.value;
            saveData();
            const newIdentifier = target.value || 'Q';
            const swCard = target.closest('.switchboard-instance');
            if (swCard) {
                const regex = /#([^.-]+)/;
                swCard.querySelectorAll('.outlet-info').forEach(info => {
                    info.textContent = info.textContent.replace(regex, `#${newIdentifier}`);
                });
            }
        }
        if (target.matches('.socapex-identifier-input')) {
            const outletIndex = target.dataset.outletIndex;
            if (!swInstance.socapexIds) swInstance.socapexIds = {};
            swInstance.socapexIds[outletIndex] = target.value;
            saveData();
            const newSocaId = target.value || (parseInt(outletIndex) + 1);
            const socaGroup = target.closest('.socapex-group');
            if (socaGroup) {
                const regex = /-(.*?)\./;
                socaGroup.querySelectorAll('.outlet-info').forEach(info => {
                    info.textContent = info.textContent.replace(regex, `-${newSocaId}.`);
                });
            }
        }
    });

    quickAddMaterialForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const name = quickMaterialNameInput.value.trim();
        const watts = parseInt(quickMaterialWattsInput.value);
        if (name && watts >= 0) {
            const newMaterial = { id: Date.now(), name, watts };
            materials.push(newMaterial);
            saveMaterials();
            const popoverResults = document.querySelector('.popover-results');
            if (popoverResults) {
                const searchInput = popoverResults.previousElementSibling;
                const filter = searchInput ? searchInput.value : '';
                popoverResults.innerHTML = '';
                 materials.filter(m => m.name.toLowerCase().includes(filter.toLowerCase())).forEach(m => {
                    const resItem = document.createElement('div');
                    resItem.className = 'inventory-item';
                    resItem.textContent = `${m.name} (${m.watts}W)`;
                    resItem.dataset.materialId = m.id;
                    resultsDiv.appendChild(resItem);
                });
            }
            quickAddMaterialForm.reset();
            quickAddMaterialModal.classList.add('hidden');
        }
    });

    cancelQuickAddBtn.addEventListener('click', () => {
        quickAddMaterialModal.classList.add('hidden');
    });

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.load-pill') && !e.target.closest('.outlet-actions') && !e.target.closest('.instance-header') && !e.target.closest('.socapex-header')) {
            removeActivePopover();
        }
    });

    renderWorkspace();
});