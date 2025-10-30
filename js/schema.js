document.addEventListener('DOMContentLoaded', () => {
    // --- ELEMENTI E DATI ---
    const schemaContainer = document.getElementById('schema-container');

    // Caricamento dati dal localStorage
    const workspaceItems = JSON.parse(localStorage.getItem('powerload_setup')) || [];
    const switchboards = JSON.parse(localStorage.getItem('powerload_switchboards')) || [];
    const materials = JSON.parse(localStorage.getItem('powerload_materials')) || [];

    const VOLTAGE = 230;

    // --- MOTORE DI CALCOLO ---
    function calculateDirectLoads(item) {
        const swTemplate = switchboards.find(s => s.id === item.templateId);
        let phaseTotals = { R: { watts: 0 }, S: { watts: 0 }, T: { watts: 0 } };
        if (!swTemplate) return phaseTotals;

        Object.keys(item.loads).forEach(loadKey => {
            const [outletIndex, channelIndex] = loadKey.split('-').map(Number);
            const outlet = swTemplate.outlets[outletIndex];
            if (!outlet) return;

            item.loads[loadKey].forEach(load => {
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

    function calculateRecursiveTotals(item, allItems) {
        let directLoads = calculateDirectLoads(item);
        let aggregatedTotals = JSON.parse(JSON.stringify(directLoads));
        const children = allItems.filter(child => child.parentId === item.instanceId);

        children.forEach(child => {
            const childTotals = calculateRecursiveTotals(child, allItems);
            ['R', 'S', 'T'].forEach(phase => aggregatedTotals[phase].watts += childTotals[phase].watts);
        });
        return aggregatedTotals;
    }
    
    // --- MOTORE DI RENDERING DELLO SCHEMA ---

    function createNode(id, type, content) {
        const node = document.createElement('div');
        node.className = `node node-${type}`;
        node.id = id;
        node.innerHTML = content;
        return node;
    }

    // MODIFICA: Il parentKey ora è solo l'ID del nodo di carico, non contiene più l'ID del materiale
    function createLoadNode(material, load, loadNodeId) {
        const totalWatts = material.watts * load.quantity;
        const content = `
            <div class="node-title">${load.quantity}x ${material.name}</div>
            <div class="node-details">
                <span>Consumo: <strong>${totalWatts.toFixed(0)}W</strong></span>
            </div>
            <div class="node-input-point"></div>
        `;
        return createNode(loadNodeId, 'load', content);
    }

    function createSwitchboardNode(item) {
        const swTemplate = switchboards.find(s => s.id === item.templateId);
        
        if (!swTemplate) {
            console.error(`Template quadro non trovato in inventario. ID Template: ${item.templateId}`);
            return null;
        }

        const totals = calculateRecursiveTotals(item, workspaceItems);
        const name = item.instanceName || swTemplate.name;
        const id = item.instanceIdentifier || `(ID: ${item.instanceId})`;

        let phaseHtml = '';
        ['R', 'S', 'T'].forEach(phase => {
            const watts = totals[phase].watts;
            const amps = watts / VOLTAGE;
            phaseHtml += `<span>${phase}: <strong>${watts.toFixed(0)}W</strong> (${amps.toFixed(1)}A)</span>`;
        });
        
        let outletsHtml = '<div class="outlet-dots">';
        swTemplate.outlets.forEach((outlet, index) => {
            outletsHtml += `<div class="outlet-container"><span class="outlet-number">${index + 1}</span><div class="outlet-dot" id="outlet-${item.instanceId}-${index}" data-outlet-index="${index}"></div></div>`;
        });
        outletsHtml += '</div>';

        const content = `
            <div class="node-title">${name} <small>${id}</small></div>
            <div class="node-details">${phaseHtml}</div>
            <div class="node-input-point" id="input-${item.instanceId}"></div>
            ${outletsHtml}
        `;
        return createNode(`node-${item.instanceId}`, 'switchboard', content);
    }
    
    function drawConnections() {
        const existingSvg = schemaContainer.querySelector('.connection-lines');
        if (existingSvg) existingSvg.remove();

        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('class', 'connection-lines');

        // CORREZIONE: Assicurarsi che il containerRect sia valido anche se lo schema è vuoto
        const containerRect = schemaContainer.getClientRects()[0] || { left: 0, top: 0 };

        // MODIFICA: Funzione per creare un percorso a "gomito" con angoli arrotondati
        const createCurve = (x1, y1, x2, y2, index = 0, total = 1) => {
            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            // MODIFICA: Aggiunto + window.scrollX per gestire lo scroll della pagina
            const relX1 = x1 - containerRect.left + schemaContainer.scrollLeft;
            const relY1 = y1 - containerRect.top + schemaContainer.scrollTop;
            const relX2 = x2 - containerRect.left + schemaContainer.scrollLeft;
            const relY2 = y2 - containerRect.top + schemaContainer.scrollTop;

            // MODIFICA: Utilizza un offset fisso in pixel invece che percentuale per un layout prevedibile.
            const baseOffset = 120; // Lunghezza del primo tratto orizzontale
            const stepOffset = 15; // Distanza tra le "corsie" di ogni linea
            const midX = relX1 + baseOffset + (stepOffset * index);

            const cornerRadius = 10;
            const xDirection = relX2 > relX1 ? 1 : -1;
            const yDirection = relY2 > relY1 ? 1 : -1;

            const d = `M ${relX1} ${relY1} L ${midX - (cornerRadius * xDirection)} ${relY1} Q ${midX} ${relY1} ${midX} ${relY1 + (cornerRadius * yDirection)} L ${midX} ${relY2 - (cornerRadius * yDirection)} Q ${midX} ${relY2} ${midX + (cornerRadius * xDirection)} ${relY2} L ${relX2} ${relY2}`;
            
            path.setAttribute('d', d);
            svg.appendChild(path);
        };
        
        // MODIFICA: Collega ogni fornitura al suo quadro principale
        const topLevelItems = workspaceItems.filter(item => !item.parentId);
        topLevelItems.forEach(item => {
            const powerSupplyNode = document.getElementById(`power-supply-${item.instanceId}`);
            const switchboardInput = document.getElementById(`input-${item.instanceId}`);
            if (powerSupplyNode && switchboardInput) {
                const supplyRect = powerSupplyNode.getBoundingClientRect();
                const childRect = switchboardInput.getBoundingClientRect();
                createCurve(supplyRect.right, supplyRect.top + supplyRect.height / 2, childRect.left, childRect.top + childRect.height / 2);
            }
        });

        
        workspaceItems.forEach(item => {
            const swTemplate = switchboards.find(s => s.id === item.templateId);
            if (!swTemplate) return;

            swTemplate.outlets.forEach((outlet, outletIndex) => {
                const outletDot = document.getElementById(`outlet-${item.instanceId}-${outletIndex}`);
                if (!outletDot) return;
                const outletRect = outletDot.getBoundingClientRect();
                const startX = outletRect.left + outletRect.width / 2;
                const startY = outletRect.top + outletRect.height / 2;

                const outletKey = `${outletIndex}-0`;
                const childSwitchboard = workspaceItems.find(child => child.parentId === item.instanceId && child.parentOutletKey === outletKey);
                if (childSwitchboard) {
                    const childInput = document.getElementById(`input-${childSwitchboard.instanceId}`);
                    if (childInput) {
                        const childRect = childInput.getBoundingClientRect();
                        createCurve(startX, startY, childRect.left, childRect.top + childRect.height / 2);
                    }
                }

                const connectLoads = (loadKey) => {
                     if(item.loads[loadKey]){
                         const loadsOnOutlet = item.loads[loadKey];
                         loadsOnOutlet.forEach((load, loadIndex) => { // 'load' qui è l'oggetto {materialId, quantity, ...}
                             const material = materials.find(m => m.id === load.materialId);
                             if (material) {
                                 // CORREZIONE: L'ID del nodo di carico deve essere univoco per istanza, non per tipo di materiale.
                                 const loadNodeId = `load-${item.instanceId}-${loadKey}-${loadIndex}`;
                                 const loadNode = document.getElementById(loadNodeId);
                                 if(loadNode){
                                    const inputPoint = loadNode.querySelector('.node-input-point');
                                    const inputRect = inputPoint.getBoundingClientRect();
                                    createCurve(startX, startY, inputRect.left, inputRect.top + inputRect.height / 2, loadIndex, loadsOnOutlet.length);
                                 }
                             }
                         });
                    }
                };

                if (outlet.type === 'Socapex') {
                    for (let ch = 0; ch < 6; ch++) connectLoads(`${outletIndex}-${ch}`);
                } else {
                    connectLoads(`${outletIndex}-0`);
                }
            });
        });
        
        schemaContainer.appendChild(svg);
    }

    function renderSchema() {
        if (workspaceItems.length === 0) {
            schemaContainer.innerHTML = '<p>Nessun quadro trovato nel setup. Aggiungine uno dalla pagina "Crea Setup Evento" per visualizzare lo schema.</p>';
            return;
        }

        // NUOVO: Aggiunge la classe per estendere la larghezza del container
        schemaContainer.closest('.container')?.classList.add('full-width-container');

        const itemMap = new Map(workspaceItems.map(item => [item.instanceId, { ...item, children: [], loads: new Map() }]));

        workspaceItems.forEach(item => {
            const itemInMap = itemMap.get(item.instanceId);
            if (itemInMap) { // Assicurati che l'item esista nella mappa
                Object.entries(item.loads).forEach(([loadKey, loadsOnOutlet]) => {
                    loadsOnOutlet.forEach((load, loadIndex) => { // 'load' è l'oggetto {materialId, ...}
                        const material = materials.find(m => m.id === load.materialId);
                        if (material) {
                           itemInMap.loads.set(`${loadKey}-${loadIndex}`, {material, load});
                        }
                    });
                });
            }

            if (item.parentId) {
                const parentInMap = itemMap.get(item.parentId);
                if (parentInMap) {
                    // CORREZIONE DEFINITIVA: Rimuove l'elemento dalla mappa principale
                    // se è un figlio, per evitare che venga considerato un top-level item.
                    // Questo è il fix per il bug della doppia "Fornitura Elettrica".
                    itemMap.delete(item.instanceId); 
                    parentInMap.children.push(itemInMap);
                }
            }
        });

        // --- NUOVA LOGICA DI RENDER ---
        schemaContainer.innerHTML = ''; // Pulisce il contenitore
        const topLevelItems = Array.from(itemMap.values()).filter(item => !item.parentId);

        topLevelItems.forEach(topLevelItem => {
            // Crea un wrapper per ogni albero
            const treeWrapper = document.createElement('div');
            treeWrapper.className = 'schema-wrapper';

            // Colonna 0: Fornitura Elettrica
            const col0 = document.createElement('div');
            col0.className = 'schema-column';
            const powerSupplyName = topLevelItem.powerSupplyName || 'Fornitura Elettrica';
            const powerSupplyNode = createNode(`power-supply-${topLevelItem.instanceId}`, 'power-supply', `<div class="node-title power-supply-title" data-instance-id="${topLevelItem.instanceId}">${powerSupplyName}</div>`);
            col0.appendChild(powerSupplyNode);
            treeWrapper.appendChild(col0);

            // Funzione ricorsiva per costruire le colonne dell'albero corrente
            function buildColumns(items, level) {
                if (items.length === 0) return;

                let column = treeWrapper.querySelector(`.schema-column.level-${level}`);
                if (!column) {
                    column = document.createElement('div');
                    column.className = `schema-column level-${level}`;
                    treeWrapper.appendChild(column);
                }

                const nextLevelItems = [];
                items.forEach(itemData => {
                    const swNode = createSwitchboardNode(itemData);
                    if (swNode) {
                        const nodeContainer = document.createElement('div');
                        nodeContainer.className = 'node-container';
                        
                        const loadsContainer = document.createElement('div');
                        loadsContainer.className = 'loads-column';
                        // CORREZIONE: I carichi sono già raggruppati, ma l'ID del nodo deve essere univoco.
                        Array.from(itemData.loads.entries()).forEach(([key, loadData]) => {
                            const keyParts = key.split('-');
                            const loadIndex = keyParts.pop();
                            const loadKey = keyParts.join('-');
                            const loadNodeId = `load-${itemData.instanceId}-${loadKey}-${loadIndex}`;
                            const loadNode = createLoadNode(loadData.material, loadData.load, loadNodeId);
                            loadsContainer.appendChild(loadNode);
                        });

                        nodeContainer.appendChild(swNode);
                        if (loadsContainer.children.length > 0) {
                            nodeContainer.appendChild(loadsContainer);
                        }
                        column.appendChild(nodeContainer);
                        
                        nextLevelItems.push(...itemData.children);
                    }
                });
                buildColumns(nextLevelItems, level + 1);
            }

            // Avvia la costruzione per il quadro principale corrente
            buildColumns([topLevelItem], 1);
            schemaContainer.appendChild(treeWrapper);
        });
        
        setTimeout(drawConnections, 100);
    }

    // --- NUOVO: LOGICA PER RENDERE IL NOME DELLA FORNITURA MODIFICABILE ---
    schemaContainer.addEventListener('click', (e) => {
        const titleElement = e.target.closest('.power-supply-title');
        if (titleElement && !titleElement.querySelector('input')) {
            const instanceId = titleElement.dataset.instanceId;
            const currentName = titleElement.textContent;
            const input = document.createElement('input');
            input.type = 'text';
            input.value = currentName;
            input.className = 'instance-name-input'; // Riusiamo uno stile esistente
            input.style.width = '100%';
            input.style.textAlign = 'center';

            titleElement.innerHTML = '';
            titleElement.appendChild(input);
            input.focus();
            input.select();

            const saveAndRender = () => {
                const newName = input.value.trim() || 'Fornitura Elettrica';
                // Salva il nome specifico per questo quadro nel setup
                const itemIndex = workspaceItems.findIndex(item => item.instanceId == instanceId);
                if (itemIndex > -1) {
                    workspaceItems[itemIndex].powerSupplyName = newName;
                    localStorage.setItem('powerload_setup', JSON.stringify(workspaceItems));
                }
                titleElement.innerHTML = newName;
            };

            input.addEventListener('blur', saveAndRender);
            input.addEventListener('keydown', (ev) => {
                if (ev.key === 'Enter') {
                    input.blur();
                } else if (ev.key === 'Escape') {
                    titleElement.innerHTML = currentName; // Annulla le modifiche
                }
            });
        }
    });


    // --- NUOVO: LOGICA PER IL PANNING (TRASCINAMENTO CON LA MANO) ---
    if (schemaContainer) {
        let isDown = false;
        let startX;
        let startY;
        let scrollLeft;
        let scrollTop;

        schemaContainer.addEventListener('mousedown', (e) => {
            // Attiva il panning solo se si clicca con il tasto sinistro
            if (e.button !== 0) return;

            isDown = true;
            schemaContainer.classList.add('active-pan');
            // Calcola la posizione iniziale del mouse e dello scroll
            startX = e.pageX - schemaContainer.offsetLeft;
            startY = e.pageY - schemaContainer.offsetTop;
            scrollLeft = schemaContainer.scrollLeft;
            scrollTop = schemaContainer.scrollTop;
            e.preventDefault(); // Impedisce la selezione del testo o altri comportamenti di default
        });

        schemaContainer.addEventListener('mouseleave', () => {
            isDown = false;
            schemaContainer.classList.remove('active-pan');
        });

        schemaContainer.addEventListener('mouseup', () => {
            isDown = false;
            schemaContainer.classList.remove('active-pan');
        });

        schemaContainer.addEventListener('mousemove', (e) => {
            if (!isDown) return;
            const x = e.pageX - schemaContainer.offsetLeft;
            const walk = x - startX;
            schemaContainer.scrollLeft = scrollLeft - walk;
        });
    }

    renderSchema();
});