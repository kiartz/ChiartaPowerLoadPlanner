document.addEventListener('DOMContentLoaded', () => {

    // Constants imported from PLP_CONFIG
    const { OUTLET_CAPACITY_WATTS, INPUT_CAPACITY_AMPS, OUTLET_TO_INPUT_MAPPING } = PLP_CONFIG;

    let materials = JSON.parse(localStorage.getItem('powerload_materials')) || [];
    const switchboards = JSON.parse(localStorage.getItem('powerload_switchboards')) || [];
    let workspaceItems = JSON.parse(localStorage.getItem('powerload_setup')) || [];
    let clipboard = null;
    let popoverAnchor = null;

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
        if (popoverAnchor) {
            popoverAnchor.style.position = '';
            popoverAnchor = null;
        }
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

        let actionButtons = `
            <button class="duplicate-sw-btn" data-instance-id="${item.instanceId}" title="Duplica questo quadro">⧉</button>
            <button class="delete-sw-btn" data-instance-id="${item.instanceId}" title="Elimina questo quadro">×</button>
        `;
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
                                        <button class="copy-load-btn" title="Copia utenza" data-instance-id="${item.instanceId}" data-load-key="${compositeKey}" data-load-index="${loadIndex}">📋</button>
                                        <button class="cut-load-btn" title="Taglia utenza" data-instance-id="${item.instanceId}" data-load-key="${compositeKey}" data-load-index="${loadIndex}">✂️</button>
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
                                    <button class="add-load-btn-quick" data-instance-id="${item.instanceId}" data-outlet-index="${outletIndex}" data-channel-index="${channelIndex}" title="Aggiungi utenza">+</button>
                                    <button class="copy-line-btn" title="Copia linea" data-instance-id="${item.instanceId}" data-load-key="${compositeKey}">📋</button>
                                    <button class="cut-line-btn" title="Taglia linea" data-instance-id="${item.instanceId}" data-load-key="${compositeKey}">✂️</button>
                                    <button class="paste-loads-btn" title="Incolla" data-instance-id="${item.instanceId}" data-load-key="${compositeKey}" ${!clipboard ? 'disabled' : ''}>📎</button>
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
                        if (material) {
                            const groupTotalWatts = load.quantity * material.watts;
                            outletTotalWatts += groupTotalWatts;
                            const lineNameDisplay = load.lineName ? `<span class="line-name-display" data-instance-id="${item.instanceId}" data-load-key="${compositeKey}" data-load-index="${loadIndex}">${load.lineName}</span>` : `<span class="line-name-display placeholder" data-instance-id="${item.instanceId}" data-load-key="${compositeKey}" data-load-index="${loadIndex}">ID Utenza</span>`;
                            loadsHtml += `
                                <span class="load-pill">
                                    ${lineNameDisplay}
                                    <input type="number" class="quantity-input" value="${load.quantity}" min="1" data-instance-id="${item.instanceId}" data-load-key="${compositeKey}" data-load-index="${loadIndex}">
                                    <span>x </span><span class="load-name" data-instance-id="${item.instanceId}" data-load-key="${compositeKey}" data-load-index="${loadIndex}">${material.name} <span class="load-group-total">(${groupTotalWatts}W)</span></span>
                                    <button class="copy-load-btn" title="Copia utenza" data-instance-id="${item.instanceId}" data-load-key="${compositeKey}" data-load-index="${loadIndex}">📋</button>
                                    <button class="cut-load-btn" title="Taglia utenza" data-instance-id="${item.instanceId}" data-load-key="${compositeKey}" data-load-index="${loadIndex}">✂️</button>
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
                                <button class="add-load-btn-quick" data-instance-id="${item.instanceId}" data-outlet-index="${outletIndex}" title="Aggiungi utenza">+</button>
                                <button class="copy-line-btn" title="Copia linea" data-instance-id="${item.instanceId}" data-load-key="${compositeKey}">📋</button>
                                <button class="cut-line-btn" title="Taglia linea" data-instance-id="${item.instanceId}" data-load-key="${compositeKey}">✂️</button>
                                <button class="paste-loads-btn" title="Incolla" data-instance-id="${item.instanceId}" data-load-key="${compositeKey}" ${!clipboard ? 'disabled' : ''}>📎</button>
                            </div>
                        </div>`;
                }
            }
        });

        const headerHtml = `<div class="instance-header"><span class="template-name">${swTemplate.name}</span><input type="text" class="instance-name-input" data-instance-id="${item.instanceId}" value="${item.instanceName || ''}" placeholder="Nome Specifico (es. Palco Luci)"><input type="text" class="instance-identifier-input" data-instance-id="${item.instanceId}" value="${item.instanceIdentifier || ''}" placeholder="ID (es. P1)"></div>`;

        const isSinglePhase = swTemplate.input && swTemplate.input.includes('3p');
        let phaseTotalsHtml = '';
        if (isSinglePhase) {
            phaseTotalsHtml = `<div class="phase-totals"><div id="phase-total-${item.instanceId}"><strong>Total Load:</strong> 0W / 0A</div></div>`;
        } else {
            phaseTotalsHtml = `<div class="phase-totals"><div id="phase-r-${item.instanceId}"><strong>R:</strong> 0W / 0A</div><div id="phase-s-${item.instanceId}"><strong>S:</strong> 0W / 0A</div><div id="phase-t-${item.instanceId}"><strong>T:</strong> 0W / 0A</div></div>`;
        }

        swCard.innerHTML = `${actionButtons}${headerHtml}${phaseTotalsHtml}<div class="outlets-container">${outletsHtml}</div>`;

        return swCard;
    }

    function calculateAllTotals() {
        workspaceItems.forEach(item => {
            // Use core logic for recursive calculation
            const finalTotals = PLP_CORE.calculateRecursiveTotals(item, workspaceItems, switchboards, materials);
            updateTotalsUI(item.instanceId, finalTotals);
        });
    }

    function updateTotalsUI(instanceId, totals) {
        const voltage = PLP_CONFIG.VOLTAGE;
        const swInstance = workspaceItems.find(item => item.instanceId === instanceId);
        if (!swInstance) return;

        const swTemplate = switchboards.find(s => s.id === swInstance.templateId);
        if (!swTemplate) return;

        const maxAmps = INPUT_CAPACITY_AMPS[swTemplate.input] || Infinity;
        const isSinglePhase = swTemplate.input && swTemplate.input.includes('3p');

        const applyWarningClass = (element, amps) => {
            element.className = '';
            if (amps > 0) {
                const loadPercentage = (amps / maxAmps) * 100;
                if (loadPercentage > 95) element.classList.add('phase-danger');
                else if (loadPercentage > 80) element.classList.add('phase-warning');
                else element.classList.add('phase-safe');
            }
        };

        if (isSinglePhase) {
            const totalDiv = document.getElementById(`phase-total-${instanceId}`);
            if (totalDiv) {
                const totalWatts = totals.R.watts + totals.S.watts + totals.T.watts;
                const totalAmps = totalWatts / voltage;
                totalDiv.innerHTML = `<strong>Total Load:</strong> ${totalWatts.toFixed(0)}W / ${totalAmps.toFixed(2)}A`;
                applyWarningClass(totalDiv, totalAmps);
            }
        } else {
            const phaseRDiv = document.getElementById(`phase-r-${instanceId}`);
            const phaseSDiv = document.getElementById(`phase-s-${instanceId}`);
            const phaseTDiv = document.getElementById(`phase-t-${instanceId}`);

            if (phaseRDiv) {
                const ampsR = totals.R.watts / voltage;
                phaseRDiv.innerHTML = `<strong>R:</strong> ${totals.R.watts.toFixed(0)}W / ${ampsR.toFixed(2)}A`;
                applyWarningClass(phaseRDiv, ampsR);
            }
            if (phaseSDiv) {
                const ampsS = totals.S.watts / voltage;
                phaseSDiv.innerHTML = `<strong>S:</strong> ${totals.S.watts.toFixed(0)}W / ${ampsS.toFixed(2)}A`;
                applyWarningClass(phaseSDiv, ampsS);
            }
            if (phaseTDiv) {
                const ampsT = totals.T.watts / voltage;
                phaseTDiv.innerHTML = `<strong>T:</strong> ${totals.T.watts.toFixed(0)}W / ${ampsT.toFixed(2)}A`;
                applyWarningClass(phaseTDiv, ampsT);
            }
        }
    }

    // MODIFICA: La funzione ora accetta l'ID del quadro "padre" per evitare di mostrarlo come collegabile
    function showLoadPopover(anchorElement, outletType, parentInstanceId, onSelect) {
        removeActivePopover();
        popoverAnchor = anchorElement;
        anchorElement.style.position = 'relative';
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
        const resultsExistingSwitchboardsDiv = popover.querySelector('.popover-results-existing-switchboards');
        searchInput.focus();

        const renderMaterials = (filter) => {
            resultsMaterialsDiv.innerHTML = '';
            materials
                .filter(m => {
                    if (!m.name.toLowerCase().includes(filter.toLowerCase())) return false;
                    // Strict filtering logic: exact match required
                    return m.connectionType === outletType;
                })
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
        renderExistingSwitchboards();
        searchInput.addEventListener('input', () => renderMaterials(searchInput.value));

        popover.addEventListener('click', (ev) => {
            const materialItem = ev.target.closest('[data-material-id]');
            const switchboardItem = ev.target.closest('[data-switchboard-id]');
            const existingSwitchboardItem = ev.target.closest('[data-instance-id-to-move]');

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

        if (target.matches('.copy-load-btn')) {
            const { instanceId, loadKey, loadIndex } = target.dataset;
            const swInstance = workspaceItems.find(item => item.instanceId == instanceId);
            if (swInstance && swInstance.loads[loadKey] && swInstance.loads[loadKey][loadIndex]) {
                clipboard = {
                    type: 'copy',
                    contentType: 'single_load',
                    load: JSON.parse(JSON.stringify(swInstance.loads[loadKey][loadIndex])) // Deep copy
                };
                renderWorkspace();
            }
            return;
        }

        if (target.matches('.cut-load-btn')) {
            const { instanceId, loadKey, loadIndex } = target.dataset;
            const swInstance = workspaceItems.find(item => item.instanceId == instanceId);
            if (swInstance && swInstance.loads[loadKey] && swInstance.loads[loadKey][loadIndex]) {
                clipboard = {
                    type: 'cut',
                    contentType: 'single_load',
                    load: JSON.parse(JSON.stringify(swInstance.loads[loadKey][loadIndex]))
                };
                swInstance.loads[loadKey].splice(loadIndex, 1);
                saveData();
                renderWorkspace();
            }
            return;
        }

        // NUOVO: Gestione copia/taglia intera linea
        if (target.matches('.copy-line-btn')) {
            const { instanceId, loadKey } = target.dataset;
            const swInstance = workspaceItems.find(item => item.instanceId == instanceId);
            if (swInstance && swInstance.loads[loadKey]) {
                clipboard = {
                    type: 'copy',
                    contentType: 'line',
                    data: JSON.parse(JSON.stringify(swInstance.loads[loadKey])) // Deep copy dell'array di carichi
                };
                renderWorkspace(); // Per aggiornare lo stato del pulsante incolla
            }
            return;
        }

        if (target.matches('.cut-line-btn')) {
            const { instanceId, loadKey } = target.dataset;
            const swInstance = workspaceItems.find(item => item.instanceId == instanceId);
            if (swInstance && swInstance.loads[loadKey]) {
                clipboard = {
                    type: 'cut',
                    contentType: 'line',
                    data: JSON.parse(JSON.stringify(swInstance.loads[loadKey]))
                };
                delete swInstance.loads[loadKey]; // Rimuove l'intera linea
                saveData();
                renderWorkspace();
            }
            return;
        }

        if (target.matches('.paste-loads-btn')) {
            const { instanceId, loadKey } = target.dataset;
            const swInstance = workspaceItems.find(item => item.instanceId == instanceId);
            if (swInstance && clipboard) {
                if (clipboard.contentType === 'single_load') {
                    if (!swInstance.loads[loadKey]) {
                        swInstance.loads[loadKey] = [];
                    }
                    const newLoad = JSON.parse(JSON.stringify(clipboard.load));
                    swInstance.loads[loadKey].push(newLoad);
                } else if (clipboard.contentType === 'line') {
                    // Incolla un'intera linea, sovrascrivendo quella esistente
                    swInstance.loads[loadKey] = JSON.parse(JSON.stringify(clipboard.data));
                }

                if (clipboard.type === 'cut') {
                    clipboard = null;
                }
                saveData();
                renderWorkspace();

            } else if (!clipboard) {
                alert('Nessun dato da incollare. Prima copia o taglia un\'utenza o un\'intera linea.');
            }
            return;
        }

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
            input.select();
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
            const outlet = swTemplate.outlets[outletIndex];
            const channelIndex = outlet.type === 'Socapex' ? parseInt(loadKey.split('-')[1]) : undefined;

            let outletTypeForFilter = channelIndex !== undefined ? 'Monofase 220V 16A' : swTemplate.outlets[outletIndex].type;

            showLoadPopover(target.parentElement, outletTypeForFilter, swInstance.instanceId, (selection) => {
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
                    info.textContent = info.textContent.replace(regex, `#${newIdentifier} `);
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
                    info.textContent = info.textContent.replace(regex, `- ${newSocaId}.`);
                });
            }
        }
    });

    quickAddMaterialForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const name = quickMaterialNameInput.value.trim();
        const watts = parseInt(quickMaterialWattsInput.value);
        const connectionType = document.getElementById('quick-material-input-connection').value.trim();
        if (name && watts >= 0 && connectionType) {
            const newMaterial = { id: Date.now(), name, watts, connectionType };
            materials.push(newMaterial);
            saveMaterials();
            quickAddMaterialForm.reset();
            quickAddMaterialModal.classList.add('hidden');
            removeActivePopover();
        } else {
            alert('Per favore, compila tutti i campi, inclusa la connessione di input.');
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