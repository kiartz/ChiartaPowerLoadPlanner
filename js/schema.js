document.addEventListener('DOMContentLoaded', () => {
    const schemaContainer = document.getElementById('schema-container');
    let workspaceItems = JSON.parse(localStorage.getItem('powerload_setup')) || [];
    const switchboards = JSON.parse(localStorage.getItem('powerload_switchboards')) || [];
    let materials = JSON.parse(localStorage.getItem('powerload_materials')) || [];
    const { VOLTAGE, OUTLET_TO_INPUT_MAPPING } = PLP_CONFIG;

    let translateX = 0;
    let translateY = 0;
    let scale = 1;

    // Funzioni di utilità
    function saveWorkspaceItems() {
        localStorage.setItem('powerload_setup', JSON.stringify(workspaceItems));
    }

    function saveMaterials() {
        localStorage.setItem('powerload_materials', JSON.stringify(materials));
    }

    // Funzione per chiudere popover attivi
    function closeActivePopover() {
        const existingPopover = document.querySelector('.add-load-popover');
        if (existingPopover) existingPopover.remove();

        if (currentPopover) {
            currentPopover.remove();
            currentPopover = null;
        }
        if (activeOutletDot) {
            activeOutletDot.classList.remove('active');
            activeOutletDot = null;
        }
    }

    // Funzione per mostrare popover di collegamento (stile setup.js)
    function showOutletPopover(outletDot, outletType, parentInstanceId, outletIndex) {
        closeActivePopover();

        activeOutletDot = outletDot;
        outletDot.classList.add('active');

        const anchorElement = outletDot.parentElement;
        anchorElement.style.position = 'relative';

        const popover = document.createElement('div');
        popover.className = 'add-load-popover';

        const requiredInputType = OUTLET_TO_INPUT_MAPPING[outletType];

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
        currentPopover = popover;

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

        const renderExistingSwitchboards = () => {
            resultsExistingSwitchboardsDiv.innerHTML = '';

            const movableItems = workspaceItems.filter(item =>
                !item.parentId && item.instanceId !== parentInstanceId
            );

            movableItems.forEach(item => {
                const template = switchboards.find(sw => sw.id === item.templateId);
                if (template && template.input === requiredInputType) {
                    const resItem = document.createElement('div');
                    resItem.className = 'inventory-item';

                    let displayText = template.name;
                    if (item.instanceName) displayText += ` (${item.instanceName})`;
                    if (item.instanceIdentifier) displayText += ` - ID: ${item.instanceIdentifier}`;

                    resItem.textContent = displayText;
                    resItem.dataset.instanceIdToMove = item.instanceId;
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
                addMaterialToOutlet(materialId, parentInstanceId, outletIndex, outletType);
                closeActivePopover();
            }
            if (switchboardItem) {
                const switchboardId = parseInt(switchboardItem.dataset.switchboardId);
                addNewSwitchboard(switchboardId, parentInstanceId, outletIndex);
                closeActivePopover();
            }
            if (existingSwitchboardItem) {
                const instanceIdToMove = parseInt(existingSwitchboardItem.dataset.instanceIdToMove);
                moveSwitchboard(instanceIdToMove, parentInstanceId, outletIndex);
                closeActivePopover();
            }
        });
    }



    function addNewSwitchboard(templateId, parentInstanceId, outletIndex) {
        const newInstance = {
            instanceId: Date.now(),
            templateId: templateId,
            parentId: parentInstanceId,
            parentOutletKey: `${outletIndex}-0`,
            instanceName: '',
            instanceIdentifier: '',
            socapexIds: {},
            loads: {}
        };
        workspaceItems.push(newInstance);
        saveWorkspaceItems();
        renderSchema();
    }

    function moveSwitchboard(instanceId, parentInstanceId, outletIndex) {
        const item = workspaceItems.find(i => i.instanceId === instanceId);
        if (item) {
            item.parentId = parentInstanceId;
            item.parentOutletKey = `${outletIndex}-0`;
            saveWorkspaceItems();
            renderSchema();
        }
    }

    function addMaterialToOutlet(materialId, parentInstanceId, outletIndex, outletType) {
        const swInstance = workspaceItems.find(item => item.instanceId === parentInstanceId);
        if (!swInstance) return;

        const loadKey = `${outletIndex}-0`;
        if (!swInstance.loads[loadKey]) swInstance.loads[loadKey] = [];

        const existingLoad = swInstance.loads[loadKey].find(load => load.materialId === materialId);
        if (existingLoad) {
            existingLoad.quantity++;
        } else {
            swInstance.loads[loadKey].push({
                materialId: materialId,
                quantity: 1,
                lineName: ''
            });
        }

        saveWorkspaceItems();
        renderSchema();
    }



    function createNode(id, type, content) {
        const node = document.createElement('div');
        node.className = `node node-${type}`;
        node.id = id;
        node.innerHTML = content;
        node.style.cursor = 'grab';

        // Restore position if exists
        const positions = JSON.parse(localStorage.getItem('schema_positions')) || {};
        if (positions[id]) {
            node.style.position = 'absolute';
            node.style.left = positions[id].left;
            node.style.top = positions[id].top;
            node.dataset.wasDragged = 'true';

            // We need to insert a placeholder if the node is absolutely positioned
            // This is tricky because the node hasn't been appended to the DOM yet
            // So we mark it to add a placeholder later or handle it in the parent
            node.dataset.needsPlaceholder = 'true';
        }

        return node;
    }

    function createLoadNode(lineLoads, loadNodeId, lineName, showInputPoint = true) {
        let totalWatts = 0;
        let itemsHtml = '';
        lineLoads.forEach(({ material, load }) => {
            const watts = material.watts * load.quantity;
            totalWatts += watts;
            itemsHtml += `<div class="load-item">${load.quantity}x ${material.name} (${watts.toFixed(0)}W)</div>`;
        });
        const content = `
            <div class="load-compact">
                <div class="load-compact-id">ID: ${lineName}</div>
                ${itemsHtml}
                <div class="load-compact-total">Totale: ${totalWatts.toFixed(0)}W</div>
            </div>
            ${showInputPoint ? '<div class="node-input-point"></div>' : ''}
        `;
        return createNode(loadNodeId, 'load', content);
    }

    function createSwitchboardNode(item) {
        const swTemplate = switchboards.find(s => s.id === item.templateId);
        if (!swTemplate) {
            console.error(`Template quadro non trovato. ID: ${item.templateId}`);
            return null;
        }

        const totals = PLP_CORE.calculateRecursiveTotals(item, workspaceItems, switchboards, materials);
        const name = item.instanceName || swTemplate.name;
        const identifier = item.instanceIdentifier || '';

        let outletConnectionHtml = '';
        if (item.parentId && item.parentOutletKey) {
            const parentItem = workspaceItems.find(i => i.instanceId === item.parentId);
            const parentTemplate = switchboards.find(s => s.id === parentItem?.templateId);
            if (parentTemplate) {
                const outletIndex = parseInt(item.parentOutletKey.split('-')[0]);
                const outlet = parentTemplate.outlets[outletIndex];
                if (outlet) {
                    const outletLabel = outlet.type === 'Socapex' ? `Socapex ${outletIndex + 1}` : outlet.type.includes('Monofase') ? `Monofase ${outletIndex + 1}` : `Presa ${outletIndex + 1}`;
                    outletConnectionHtml = `<div class="sw-outlet-connection">${outletLabel}</div>`;
                }
            }
        }

        let phaseHtml = '';
        ['R', 'S', 'T'].forEach(phase => {
            const watts = totals[phase].watts;
            const amps = watts / VOLTAGE;
            phaseHtml += `<div class="phase-row"><span class="phase-label">${phase}:</span> <strong>${watts.toFixed(0)}W</strong> <span class="phase-amps">(${amps.toFixed(1)}A)</span></div>`;
        });

        let outletsHtml = '';
        swTemplate.outlets.forEach((outlet, index) => {
            const outletLabel = outlet.type === 'Socapex' ? `S${index + 1}` : outlet.type.includes('Monofase') ? `M${index + 1}` : `P${index + 1}`;
            outletsHtml += `<div class="outlet-container"><span class="outlet-label">${outletLabel}</span><div class="outlet-dot" id="outlet-${item.instanceId}-${index}" data-outlet-index="${index}" data-outlet-type="${outlet.type}" data-instance-id="${item.instanceId}"></div></div>`;
        });

        const serialNumber = item.serialNumber || '';
        const content = `
            <div class="switchboard-node-body">
                <div class="sw-left-section">
                    <div class="sw-name">${name} ${identifier ? `<span class="sw-identifier">(${identifier})</span>` : ''}</div>
                    <div class="sw-model">${swTemplate.name}</div>
                    ${outletConnectionHtml}
                    <div class="phase-totals-compact">${phaseHtml}</div>
                </div>
                <div class="sw-right-section">
                    ${outletsHtml}
                </div>
            </div>
            <div class="node-input-point" id="input-${item.instanceId}"></div>
        `;
        return createNode(`node-${item.instanceId}`, 'switchboard', content);
    }

    const lineControlPoints = JSON.parse(localStorage.getItem('line_control_points')) || {};
    let isDraggingControlPoint = false;
    let activeControlPoint = null;
    let selectedLine = null;

    function drawConnections() {
        const canvasWrapper = schemaContainer.querySelector('.schema-canvas');
        if (!canvasWrapper) return;

        const existingSvg = canvasWrapper.querySelector('.connection-lines');
        if (existingSvg) existingSvg.remove();

        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('class', 'connection-lines');

        const allNodes = canvasWrapper.querySelectorAll('.node, .socapex-wrapper');
        let maxX = 0, maxY = 0;
        allNodes.forEach(node => {
            const rect = node.getBoundingClientRect();
            const canvasRect = canvasWrapper.getBoundingClientRect();
            const x = rect.right - canvasRect.left;
            const y = rect.bottom - canvasRect.top;
            if (x > maxX) maxX = x;
            if (y > maxY) maxY = y;
        });

        svg.style.width = '100%';
        svg.style.height = '100%';
        svg.style.position = 'absolute';
        svg.style.top = '0';
        svg.style.left = '0';
        svg.style.pointerEvents = 'none';
        svg.style.zIndex = '10';

        const canvasRect = canvasWrapper.getBoundingClientRect();
        if (!canvasRect.width) return;

        const createCurvedLine = (x1, y1, x2, y2, lineId) => {
            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');

            // Convert screen coordinates to canvas-relative coordinates, accounting for scale
            const visualX1 = (x1 - canvasRect.left) / scale;
            const visualY1 = (y1 - canvasRect.top) / scale;
            const visualX2 = (x2 - canvasRect.left) / scale;
            const visualY2 = (y2 - canvasRect.top) / scale;

            let cp1x, cp1y, cp2x, cp2y;
            if (lineControlPoints[lineId]) {
                cp1x = lineControlPoints[lineId].cp1x;
                cp1y = lineControlPoints[lineId].cp1y;
                cp2x = lineControlPoints[lineId].cp2x;
                cp2y = lineControlPoints[lineId].cp2y;
            } else {
                const controlOffset = Math.abs(visualX2 - visualX1) * 0.5;
                cp1x = visualX1 + controlOffset;
                cp1y = visualY1;
                cp2x = visualX2 - controlOffset;
                cp2y = visualY2;
            }

            const pathData = `M ${visualX1} ${visualY1} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${visualX2} ${visualY2}`;
            path.setAttribute('d', pathData);
            path.setAttribute('stroke', 'var(--primary-color)');
            path.setAttribute('stroke-width', '2');
            path.setAttribute('fill', 'none');
            path.setAttribute('opacity', '0.6');
            path.setAttribute('data-line-id', lineId);
            path.style.cursor = 'pointer';
            path.style.pointerEvents = 'stroke';

            const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            group.setAttribute('class', 'line-group');
            group.setAttribute('data-line-id', lineId);

            const cp1 = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            cp1.setAttribute('cx', cp1x);
            cp1.setAttribute('cy', cp1y);
            cp1.setAttribute('r', '6');
            cp1.setAttribute('fill', '#ff6b35');
            cp1.setAttribute('stroke', '#fff');
            cp1.setAttribute('stroke-width', '2');
            cp1.setAttribute('class', 'control-point');
            cp1.setAttribute('data-line-id', lineId);
            cp1.setAttribute('data-cp', 'cp1');
            cp1.style.cursor = 'move';
            cp1.style.display = 'none';
            cp1.style.pointerEvents = 'all';

            const cp2 = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            cp2.setAttribute('cx', cp2x);
            cp2.setAttribute('cy', cp2y);
            cp2.setAttribute('r', '6');
            cp2.setAttribute('fill', '#ff6b35');
            cp2.setAttribute('stroke', '#fff');
            cp2.setAttribute('stroke-width', '2');
            cp2.setAttribute('class', 'control-point');
            cp2.setAttribute('data-line-id', lineId);
            cp2.setAttribute('data-cp', 'cp2');
            cp2.style.cursor = 'move';
            cp2.style.display = 'none';
            cp2.style.pointerEvents = 'all';

            group.appendChild(path);
            group.appendChild(cp1);
            group.appendChild(cp2);
            svg.appendChild(group);
        };

        const topLevelItems = workspaceItems.filter(item => !item.parentId);
        topLevelItems.forEach(item => {
            const powerSupplyOutput = document.getElementById(`output-${item.instanceId}`);
            const switchboardInput = document.getElementById(`input-${item.instanceId}`);
            if (powerSupplyOutput && switchboardInput) {
                const outputRect = powerSupplyOutput.getBoundingClientRect();
                const inputRect = switchboardInput.getBoundingClientRect();
                const lineId = `ps-${item.instanceId}`;
                createCurvedLine(outputRect.left + outputRect.width / 2, outputRect.top + outputRect.height / 2, inputRect.left + inputRect.width / 2, inputRect.top + inputRect.height / 2, lineId);
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
                        const lineId = `sw-${item.instanceId}-${outletIndex}-${childSwitchboard.instanceId}`;
                        createCurvedLine(startX, startY, childRect.left + childRect.width / 2, childRect.top + childRect.height / 2, lineId);
                    }
                }

                const connectLoads = (loadKey) => {
                    if (item.loads[loadKey]) {
                        const loadsOnOutlet = item.loads[loadKey];
                        const groupedByLine = {};
                        loadsOnOutlet.forEach((load) => {
                            const lineName = load.lineName || 'N/A';
                            if (!groupedByLine[lineName]) groupedByLine[lineName] = true;
                        });
                        Object.keys(groupedByLine).forEach((lineName) => {
                            const loadNodeId = `load-${item.instanceId}-${loadKey}-${lineName}`;
                            const loadNode = document.getElementById(loadNodeId);
                            if (loadNode) {
                                const inputPoint = loadNode.querySelector('.node-input-point');
                                const inputRect = inputPoint.getBoundingClientRect();
                                const lineId = `load-${item.instanceId}-${loadKey}-${lineName}`;
                                createCurvedLine(startX, startY, inputRect.left + inputRect.width / 2, inputRect.top + inputRect.height / 2, lineId);
                            }
                        });
                    }
                };

                const connectSocapex = (outletIndex) => {
                    const socapexKey = `${outletIndex}-socapex`;
                    const socapexWrapper = document.getElementById(`socapex-${item.instanceId}-${socapexKey}`);
                    if (socapexWrapper) {
                        const inputPoint = socapexWrapper.querySelector('.node-input-point');
                        if (inputPoint) {
                            const inputRect = inputPoint.getBoundingClientRect();
                            const lineId = `socapex-${item.instanceId}-${outletIndex}`;
                            createCurvedLine(startX, startY, inputRect.left + inputRect.width / 2, inputRect.top + inputRect.height / 2, lineId);
                        }
                    }
                };

                if (outlet.type === 'Socapex') {
                    connectSocapex(outletIndex);
                } else {
                    connectLoads(`${outletIndex}-0`);
                }
            });
        });

        // Append SVG to canvasWrapper
        canvasWrapper.insertBefore(svg, canvasWrapper.firstChild);
    }

    function alignChildrenVertically() {
        // Funzione disabilitata per layout orizzontale. Le connessioni vengono comunque disegnate.
        setTimeout(drawConnections, 50);
    }


    function renderSchema() {
        if (workspaceItems.length === 0) {
            schemaContainer.innerHTML = '<p>Nessun quadro trovato nel setup. Aggiungine uno dalla pagina "Crea Setup Evento" per visualizzare lo schema.</p>';
            return;
        }

        schemaContainer.closest('.container')?.classList.add('full-width-container');

        const itemMap = new Map(workspaceItems.map(item => [item.instanceId, { ...item, children: [], loads: new Map() }]));

        workspaceItems.forEach(item => {
            const itemInMap = itemMap.get(item.instanceId);
            if (itemInMap) {
                const swTemplate = switchboards.find(s => s.id === item.templateId);
                Object.entries(item.loads).forEach(([loadKey, loadsOnOutlet]) => {
                    const [outletIndex, channelIndex] = loadKey.split('-').map(Number);
                    const outlet = swTemplate?.outlets[outletIndex];

                    const groupedByLine = {};
                    loadsOnOutlet.forEach((load) => {
                        const lineName = load.lineName || 'N/A';
                        if (!groupedByLine[lineName]) groupedByLine[lineName] = [];
                        const material = materials.find(m => m.id === load.materialId);
                        if (material) groupedByLine[lineName].push({ material, load });
                    });

                    if (outlet?.type === 'Socapex') {
                        const socapexKey = `${outletIndex}-socapex`;
                        if (!itemInMap.loads.has(socapexKey)) {
                            itemInMap.loads.set(socapexKey, { isSocapex: true, channels: new Map(), identifier: item.socapexIds?.[outletIndex] || `Socapex ${outletIndex + 1}` });
                        }
                        const socapexData = itemInMap.loads.get(socapexKey);
                        Object.entries(groupedByLine).forEach(([lineName, lineLoads]) => {
                            socapexData.channels.set(`${loadKey}-${lineName}`, lineLoads);
                        });
                    } else {
                        Object.entries(groupedByLine).forEach(([lineName, lineLoads]) => {
                            itemInMap.loads.set(`${loadKey}-${lineName}`, lineLoads);
                        });
                    }
                });
            }
        });

        // Costruisci la gerarchia DOPO aver processato tutti i carichi
        workspaceItems.forEach(item => {
            if (item.parentId) {
                const itemInMap = itemMap.get(item.instanceId);
                const parentInMap = itemMap.get(item.parentId);
                if (itemInMap && parentInMap) {
                    itemInMap.outletIndex = parseInt(item.parentOutletKey.split('-')[0]);
                    parentInMap.children.push(itemInMap);
                    itemMap.delete(item.instanceId);
                }
            }
        });

        itemMap.forEach(parent => {
            parent.children.sort((a, b) => (a.outletIndex || 0) - (b.outletIndex || 0));
        });

        workspaceItems.forEach(item => {
            const itemInMap = itemMap.get(item.instanceId);
            if (itemInMap && itemInMap.loads.size > 0) {
                const sortedLoads = new Map([...itemInMap.loads.entries()].sort((a, b) => {
                    const aIndex = parseInt(a[0].split('-')[0]);
                    const bIndex = parseInt(b[0].split('-')[0]);
                    return aIndex - bIndex;
                }));
                itemInMap.loads = sortedLoads;
            }
        });

        schemaContainer.innerHTML = '';

        // Create a large inner canvas for the workspace
        const canvasWrapper = document.createElement('div');
        canvasWrapper.className = 'schema-canvas';
        canvasWrapper.style.position = 'relative';
        canvasWrapper.style.width = '10000px';
        canvasWrapper.style.height = '10000px';
        canvasWrapper.style.minWidth = '10000px';
        canvasWrapper.style.minHeight = '10000px';
        schemaContainer.appendChild(canvasWrapper);

        const topLevelItems = Array.from(itemMap.values());

        topLevelItems.forEach(topLevelItem => {
            if (!topLevelItem.instanceId) return;

            const treeWrapper = document.createElement('div');
            treeWrapper.className = 'schema-wrapper';

            const col0 = document.createElement('div');
            col0.className = 'schema-column level-0';

            // Gestione forniture elettriche senza template
            if (!topLevelItem.templateId) {
                const powerSupplyName = topLevelItem.powerSupplyName || 'Fornitura Elettrica';
                const powerSupplyNode = createNode(`power-supply-${topLevelItem.instanceId}`, 'power-supply', `<div class="node-title power-supply-title" data-instance-id="${topLevelItem.instanceId}">${powerSupplyName}</div><div class="node-output-point" id="output-${topLevelItem.instanceId}"></div>`);
                col0.appendChild(powerSupplyNode);
                treeWrapper.appendChild(col0);

                if (treeWrapper.querySelectorAll('.node').length > 0) {
                    canvasWrapper.appendChild(treeWrapper);
                }
                return;
            }

            const powerSupplyName = topLevelItem.powerSupplyName || 'Fornitura Elettrica';
            const powerSupplyNode = createNode(`power-supply-${topLevelItem.instanceId}`, 'power-supply', `<div class="node-title power-supply-title" data-instance-id="${topLevelItem.instanceId}">${powerSupplyName}</div><div class="node-output-point" id="output-${topLevelItem.instanceId}"></div>`);
            col0.appendChild(powerSupplyNode);
            treeWrapper.appendChild(col0);

            function buildColumns(items, level, markFirstChild = false) {
                if (items.length === 0) return null;

                const columnContainer = document.createElement('div');
                columnContainer.className = `schema-column level-${level}`;

                // Per i quadri figli, allinea il primo alla stessa altezza del padre
                if (level > 1) {
                    columnContainer.style.marginTop = '0px';
                }

                items.forEach((itemData, index) => {
                    const swNode = createSwitchboardNode(itemData);
                    if (!swNode) return;

                    if (markFirstChild && index === 0) {
                        swNode.dataset.firstChild = 'true';
                    }

                    columnContainer.appendChild(swNode);

                    // Add placeholder if needed (restored position)
                    if (swNode.dataset.needsPlaceholder === 'true') {
                        const placeholder = document.createElement('div');
                        placeholder.className = 'node-placeholder';
                        // We can't know exact dimensions yet, but we can try to guess or set it after render
                        // For now, let's use a generic size or try to measure
                        // Actually, since it's absolute, it won't take space. 
                        // To properly restore layout, we might need to render it static first, then measure, then absolute.
                        // BUT, if we saved it as absolute, we want it absolute.
                        // The issue is the hole it leaves.

                        // Let's try a different approach:
                        // If it was dragged, we assume the user wanted it out of the flow.
                        // So we might NOT want a placeholder if it was permanently moved?
                        // The user said "when I move a switchboard... everything else moves".
                        // If we restore it as absolute, the flow collapses.
                        // So we MUST put a placeholder to keep the original flow if that's desired.

                        // However, we don't know the size until it renders.
                        // Let's append a script or use a ResizeObserver to set placeholder size?
                        // Or simply: don't set absolute immediately?
                        // No, if we don't set absolute, it will jump.

                        // Let's create a placeholder with auto size that matches the node's content?
                        // Let's create a placeholder with auto size that matches the node's content?
                        // We can clone the node, make it invisible (visibility: hidden), and static.
                        const ghost = swNode.cloneNode(true);
                        ghost.id = '';
                        // IMPORTANT: Use !important to override inline styles from the clone
                        ghost.style.cssText = 'position: static !important; display: none !important; pointer-events: none !important;';
                        ghost.classList.add('node-placeholder-ghost');
                        // Remove IDs from children to avoid duplicates
                        ghost.querySelectorAll('[id]').forEach(el => el.id = '');
                        columnContainer.insertBefore(ghost, swNode);
                    }
                });

                return columnContainer;
            }

            function buildLoadsColumn(itemData) {
                const mixedItems = [];

                Array.from(itemData.loads.entries()).forEach(([key, data]) => {
                    const outletIndex = parseInt(key.split('-')[0]);
                    mixedItems.push({ type: 'load', key, data, outletIndex });
                });

                mixedItems.sort((a, b) => a.outletIndex - b.outletIndex);
                const orderedLoads = mixedItems.filter(item => item.type === 'load');

                if (orderedLoads.length === 0) return null;

                const loadsColumn = document.createElement('div');
                loadsColumn.className = 'loads-column';
                const positions = JSON.parse(localStorage.getItem('schema_positions')) || {};

                orderedLoads.forEach(({ key, data }) => {
                    if (data.isSocapex) {
                        if (data.channels.size === 0) return;

                        const socapexWrapper = document.createElement('div');
                        socapexWrapper.className = 'socapex-wrapper';
                        socapexWrapper.id = `socapex-${itemData.instanceId}-${key}`;

                        const socapexHeader = document.createElement('div');
                        socapexHeader.className = 'socapex-wrapper-header';
                        const quadroId = itemData.instanceIdentifier || itemData.instanceName || 'N/A';
                        socapexHeader.textContent = `${quadroId} - ${data.identifier}`;
                        socapexWrapper.appendChild(socapexHeader);

                        const socapexInputPoint = document.createElement('div');
                        socapexInputPoint.className = 'node-input-point';
                        socapexWrapper.appendChild(socapexInputPoint);

                        const socapexLoadsContainer = document.createElement('div');
                        socapexLoadsContainer.className = 'socapex-compact-grid';
                        socapexWrapper.appendChild(socapexLoadsContainer);

                        // Calcola i totali per i canali 1-6
                        const channelTotals = {};
                        for (let i = 1; i <= 6; i++) channelTotals[i] = 0;

                        Array.from(data.channels.entries()).forEach(([channelKey, lineLoads]) => {
                            const keyParts = channelKey.split('-');
                            const lineName = keyParts.pop(); // Remove line name
                            const channelIndex = parseInt(keyParts.pop()); // Get channel index (0-5)

                            let total = 0;
                            lineLoads.forEach(item => total += item.material.watts * item.load.quantity);

                            const chNum = channelIndex + 1; // Convert 0-based index to 1-based channel number
                            if (!isNaN(chNum) && chNum >= 1 && chNum <= 6) {
                                channelTotals[chNum] += total;
                            }
                        });

                        // Renderizza la griglia 1-6
                        for (let i = 1; i <= 6; i++) {
                            const watts = channelTotals[i];
                            const chDiv = document.createElement('div');
                            chDiv.className = `socapex-compact-channel ${watts > 0 ? 'has-load' : ''}`;
                            chDiv.innerHTML = `
                                <span class="ch-num">${i}</span>
                                <span class="ch-watts">${watts}W</span>
                            `;
                            socapexLoadsContainer.appendChild(chDiv);
                        }

                        loadsColumn.appendChild(socapexWrapper);
                    } else {
                        const keyParts = key.split('-');
                        const lineName = keyParts.pop();
                        const loadKey = keyParts.join('-');
                        const loadNodeId = `load-${itemData.instanceId}-${loadKey}-${lineName}`;
                        const loadNode = createLoadNode(data, loadNodeId, lineName);

                        loadsColumn.appendChild(loadNode);
                    }
                });

                return loadsColumn;
            }

            function buildTree(itemData, level, renderSelf = true) {
                // Render del nodo corrente e dei suoi carichi (solo al livello iniziale)
                if (renderSelf) {
                    const swColumn = buildColumns([itemData], level);
                    if (swColumn) treeWrapper.appendChild(swColumn);

                    const loadsColumn = buildLoadsColumn(itemData);
                    if (loadsColumn) treeWrapper.appendChild(loadsColumn);
                }

                // Gestione figli: renderizza la colonna dei figli e i loro carichi
                if (itemData.children.length > 0) {
                    itemData.children.sort((a, b) => (a.outletIndex || 0) - (b.outletIndex || 0));

                    // Colonna con i nodi dei figli (primo allineato al padre)
                    const childrenColumn = buildColumns(itemData.children, level + 1, true);
                    if (childrenColumn) {
                        childrenColumn.dataset.parentId = itemData.instanceId; // Per l'allineamento di colonna
                        childrenColumn.style.alignItems = 'flex-start';
                        childrenColumn.style.justifyContent = 'flex-start';
                        treeWrapper.appendChild(childrenColumn);
                    }

                    // Colonna con i carichi dei figli
                    itemData.children.forEach(child => {
                        const childLoadsColumn = buildLoadsColumn(child);
                        if (childLoadsColumn) treeWrapper.appendChild(childLoadsColumn);
                    });

                    // Ricorsione: costruisci SOLO le colonne dei nipoti (senza ridisegnare i nodi dei figli)
                    itemData.children.forEach(child => {
                        if (child.children && child.children.length > 0) {
                            buildTree(child, level + 1, false);
                        }
                    });
                }
            }

            buildTree(topLevelItem, 1);

            if (treeWrapper.querySelectorAll('.node-switchboard').length > 0) {
                canvasWrapper.appendChild(treeWrapper);
            }
        });

        // Start view at top-left
        setTimeout(() => {
            translateX = 0;
            translateY = 0;
            updateTransform();

            alignParentChildHeight();
            alignChildrenVertically();
        }, 100);
    }

    schemaContainer.addEventListener('input', (e) => {
        if (e.target.classList.contains('sw-serial-input')) {
            const instanceId = e.target.dataset.instanceId;
            const serialNumber = e.target.value;
            const itemIndex = workspaceItems.findIndex(item => item.instanceId == instanceId);
            if (itemIndex > -1) {
                workspaceItems[itemIndex].serialNumber = serialNumber;
                localStorage.setItem('powerload_setup', JSON.stringify(workspaceItems));
            }
        }
    });

    schemaContainer.addEventListener('click', (e) => {
        const titleElement = e.target.closest('.power-supply-title');
        if (titleElement && !titleElement.querySelector('input')) {
            const instanceId = titleElement.dataset.instanceId;
            const currentName = titleElement.textContent;
            const input = document.createElement('input');
            input.type = 'text';
            input.value = currentName;
            input.className = 'instance-name-input';
            input.style.width = '100%';
            input.style.textAlign = 'center';

            titleElement.innerHTML = '';
            titleElement.appendChild(input);
            input.focus();
            input.select();

            const saveAndRender = () => {
                const newName = input.value.trim() || 'Fornitura Elettrica';
                const itemIndex = workspaceItems.findIndex(item => item.instanceId == instanceId);
                if (itemIndex > -1) {
                    workspaceItems[itemIndex].powerSupplyName = newName;
                    localStorage.setItem('powerload_setup', JSON.stringify(workspaceItems));
                }
                titleElement.innerHTML = newName;
            };

            input.addEventListener('blur', saveAndRender);
            input.addEventListener('keydown', (ev) => {
                if (ev.key === 'Enter') input.blur();
                else if (ev.key === 'Escape') titleElement.innerHTML = currentName;
            });
        }
    });



    // Gestori eventi per i nuovi pulsanti della toolbar
    const addPowerSupplyBtn = document.getElementById('add-power-supply-btn');
    const addSwitchboardBtn = document.getElementById('add-switchboard-btn');
    const addLoadBtn = document.getElementById('add-load-btn');
    const addSwModal = document.getElementById('add-switchboard-modal');
    const addLoadModal = document.getElementById('add-load-modal');
    const inventorySwList = document.getElementById('inventory-switchboard-list');
    const inventoryLoadList = document.getElementById('inventory-load-list');
    const cancelAddSwBtn = document.getElementById('cancel-add-sw-btn');
    const cancelAddLoadBtn = document.getElementById('cancel-add-load-btn');
    const loadSearchInput = document.getElementById('load-search');
    const switchboardSearchInput = document.getElementById('switchboard-search');

    if (addPowerSupplyBtn) {
        addPowerSupplyBtn.addEventListener('click', () => {
            const powerSupplyName = prompt('Nome della fornitura elettrica:', 'Fornitura Principale');
            if (powerSupplyName) {
                const newInstance = {
                    instanceId: Date.now(),
                    templateId: null, // Fornitura elettrica non ha template
                    instanceName: '',
                    instanceIdentifier: '',
                    powerSupplyName: powerSupplyName,
                    socapexIds: {},
                    loads: {}
                };
                workspaceItems.push(newInstance);
                saveWorkspaceItems();
                renderSchema();
            }
        });
    }

    function populateSwitchboardModal(filter = '') {
        inventorySwList.innerHTML = '';
        switchboards
            .filter(sw => sw.name.toLowerCase().includes(filter.toLowerCase()))
            .forEach(sw => {
                const swItem = document.createElement('div');
                swItem.className = 'inventory-item';
                swItem.textContent = `${sw.name} (Input: ${sw.input})`;
                swItem.style.cursor = 'pointer';
                swItem.dataset.id = sw.id;
                inventorySwList.appendChild(swItem);
            });
    }

    if (addSwitchboardBtn) {
        addSwitchboardBtn.addEventListener('click', () => {
            populateSwitchboardModal();
            addSwModal.classList.remove('hidden');
            if (switchboardSearchInput) switchboardSearchInput.value = '';
            if (switchboardSearchInput) switchboardSearchInput.focus();
        });
    }

    if (switchboardSearchInput) {
        switchboardSearchInput.addEventListener('input', () => {
            populateSwitchboardModal(switchboardSearchInput.value);
        });
    }

    if (addLoadBtn) {
        addLoadBtn.addEventListener('click', () => {
            populateLoadModal();
            addLoadModal.classList.remove('hidden');
        });
    }

    function populateLoadModal(filter = '') {
        inventoryLoadList.innerHTML = '';
        materials
            .filter(m => m.name.toLowerCase().includes(filter.toLowerCase()))
            .forEach(material => {
                const item = document.createElement('div');
                item.className = 'inventory-item';
                item.textContent = `${material.name} (${material.watts}W) - ${material.connectionType}`;
                item.style.cursor = 'pointer';
                item.dataset.id = material.id;
                inventoryLoadList.appendChild(item);
            });
    }

    if (loadSearchInput) {
        loadSearchInput.addEventListener('input', () => {
            populateLoadModal(loadSearchInput.value);
        });
    }

    if (inventorySwList) {
        inventorySwList.addEventListener('click', (e) => {
            if (e.target.matches('.inventory-item')) {
                const templateId = parseInt(e.target.dataset.id);
                const newInstance = {
                    instanceId: Date.now(),
                    templateId: templateId,
                    instanceName: '',
                    instanceIdentifier: '',
                    socapexIds: {},
                    loads: {}
                };
                workspaceItems.push(newInstance);
                saveWorkspaceItems();
                renderSchema();
                addSwModal.classList.add('hidden');
            }
        });
    }

    if (inventoryLoadList) {
        inventoryLoadList.addEventListener('click', (e) => {
            if (e.target.matches('.inventory-item')) {
                const materialId = parseInt(e.target.dataset.id);
                createStandaloneLoadNode(materialId);
                addLoadModal.classList.add('hidden');
            }
        });
    }

    function createStandaloneLoadNode(materialId) {
        const material = materials.find(m => m.id === materialId);
        if (!material) return;

        // Crea un nodo load temporaneo che può essere trascinato
        const loadNode = document.createElement('div');
        loadNode.className = 'node node-load standalone-load';
        loadNode.style.position = 'absolute';
        loadNode.style.left = '50px';
        loadNode.style.top = '50px';
        loadNode.style.zIndex = '1000';
        loadNode.dataset.materialId = materialId;

        loadNode.innerHTML = `
            <div class="load-compact">
                <div class="load-compact-id">Utenza Standalone</div>
                <div class="load-item">${material.name} (${material.watts}W)</div>
                <div class="load-compact-total">Tipo: ${material.connectionType}</div>
            </div>
            <div class="node-input-point"></div>
            <button class="delete-standalone-load" style="position: absolute; top: -5px; right: -5px; background: var(--danger-color); color: white; border: none; border-radius: 50%; width: 20px; height: 20px; font-size: 12px; cursor: pointer;">×</button>
        `;

        const canvasWrapper = schemaContainer.querySelector('.schema-canvas');
        if (canvasWrapper) {
            // Position at center of current viewport
            const centerX = schemaContainer.scrollLeft + schemaContainer.clientWidth / 2 - 100;
            const centerY = schemaContainer.scrollTop + schemaContainer.clientHeight / 2 - 50;

            loadNode.style.left = centerX + 'px';
            loadNode.style.top = centerY + 'px';

            canvasWrapper.appendChild(loadNode);
        } else {
            schemaContainer.appendChild(loadNode);
        }

        // Aggiungi gestione eliminazione
        const deleteBtn = loadNode.querySelector('.delete-standalone-load');
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            loadNode.remove();
        });

        // Rendi il nodo trascinabile
        makeNodeDraggable(loadNode);
    }

    function makeNodeDraggable(node) {
        let isDragging = false;
        let startX, startY, initialLeft, initialTop;

        node.addEventListener('mousedown', (e) => {
            if (e.target.classList.contains('delete-standalone-load')) return;

            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            initialLeft = parseInt(node.style.left) || 0;
            initialTop = parseInt(node.style.top) || 0;

            node.style.cursor = 'grabbing';
            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;

            const dx = e.clientX - startX;
            const dy = e.clientY - startY;

            node.style.left = (initialLeft + dx) + 'px';
            node.style.top = (initialTop + dy) + 'px';

            // Evidenzia outlet compatibili
            const materialId = parseInt(node.dataset.materialId);
            const material = materials.find(m => m.id === materialId);

            document.querySelectorAll('.outlet-dot').forEach(dot => {
                dot.classList.remove('drop-target');

                const outletType = dot.dataset.outletType;
                let isCompatible = false;

                if (outletType === 'Monofase 220V 16A') {
                    isCompatible = material.connectionType && material.connectionType.includes('Monofase') && material.connectionType.includes('16A');
                } else {
                    isCompatible = material.connectionType === outletType;
                }

                if (isCompatible) {
                    dot.classList.add('drop-target');
                }
            });
        });

        document.addEventListener('mouseup', (e) => {
            if (isDragging) {
                isDragging = false;
                node.style.cursor = 'grab';

                // Controlla se il nodo è stato rilasciato su un outlet
                const target = document.elementFromPoint(e.clientX, e.clientY);
                if (target && target.classList.contains('outlet-dot')) {
                    const materialId = parseInt(node.dataset.materialId);
                    const material = materials.find(m => m.id === materialId);
                    const outletType = target.dataset.outletType;

                    // Verifica compatibilità
                    let isCompatible = false;
                    if (outletType === 'Monofase 220V 16A') {
                        isCompatible = material.connectionType && material.connectionType.includes('Monofase') && material.connectionType.includes('16A');
                    } else {
                        isCompatible = material.connectionType === outletType;
                    }

                    if (isCompatible) {
                        const instanceId = parseInt(target.dataset.instanceId);
                        const outletIndex = parseInt(target.dataset.outletIndex);

                        addMaterialToOutlet(materialId, instanceId, outletIndex, outletType);
                        node.remove(); // Rimuovi il nodo standalone
                    } else {
                        alert(`Incompatibile: ${material.connectionType} non può essere collegato a ${outletType}`);
                    }
                }

                // Rimuovi evidenziazione da tutti gli outlet
                document.querySelectorAll('.outlet-dot').forEach(dot => {
                    dot.classList.remove('drop-target');
                });
            }
        });

        node.style.cursor = 'grab';
    }

    if (cancelAddSwBtn) {
        cancelAddSwBtn.addEventListener('click', () => {
            addSwModal.classList.add('hidden');
        });
    }

    if (cancelAddLoadBtn) {
        cancelAddLoadBtn.addEventListener('click', () => {
            addLoadModal.classList.add('hidden');
        });
    }

    // Gestione click sugli outlet dots
    schemaContainer.addEventListener('click', (e) => {
        if (e.target.classList.contains('outlet-dot')) {
            e.stopPropagation();

            const outletIndex = parseInt(e.target.dataset.outletIndex);
            const instanceId = e.target.id.split('-')[1];
            const swInstance = workspaceItems.find(item => item.instanceId == instanceId);
            const swTemplate = switchboards.find(s => s.id === swInstance?.templateId);

            if (swTemplate && swTemplate.outlets[outletIndex]) {
                const outlet = swTemplate.outlets[outletIndex];
                showOutletPopover(e.target, outlet.type, parseInt(instanceId), outletIndex);
            }
        }
    });

    // Sistema di drag-and-drop per collegamenti
    let isDraggingConnection = false;
    let dragStartOutlet = null;

    schemaContainer.addEventListener('mousedown', (e) => {
        if (e.target.classList.contains('outlet-dot') && e.button === 0) {
            e.preventDefault();
            e.stopPropagation();

            isDraggingConnection = true;
            dragStartOutlet = e.target;

            // Crea linea di trascinamento
            const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svg.setAttribute('class', 'drag-line');
            svg.style.position = 'absolute';
            svg.style.top = '0';
            svg.style.left = '0';
            svg.style.width = '100%';
            svg.style.height = '100%';
            svg.style.pointerEvents = 'none';
            svg.style.zIndex = '1500';

            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.setAttribute('stroke', 'var(--primary-color)');
            path.setAttribute('stroke-width', '3');
            path.setAttribute('stroke-dasharray', '5,5');
            path.setAttribute('fill', 'none');
            path.setAttribute('opacity', '0.8');

            svg.appendChild(path);
            schemaContainer.appendChild(svg);
            dragLine = { svg, path };

            return false;
        }
    });

    document.addEventListener('mousemove', (e) => {
        if (isDraggingConnection && dragLine && dragStartOutlet) {
            const containerRect = schemaContainer.getBoundingClientRect();
            const startRect = dragStartOutlet.getBoundingClientRect();

            const startX = startRect.left - containerRect.left + schemaContainer.scrollLeft + startRect.width / 2;
            const startY = startRect.top - containerRect.top + schemaContainer.scrollTop + startRect.height / 2;
            const endX = e.clientX - containerRect.left + schemaContainer.scrollLeft;
            const endY = e.clientY - containerRect.top + schemaContainer.scrollTop;

            const pathData = `M ${startX} ${startY} L ${endX} ${endY}`;
            dragLine.path.setAttribute('d', pathData);
        }
    });

    document.addEventListener('mouseup', (e) => {
        if (isDraggingConnection) {
            isDraggingConnection = false;

            // Rimuovi linea di trascinamento
            if (dragLine) {
                dragLine.svg.remove();
                dragLine = null;
            }

            // Controlla se si è rilasciato su un input point
            const target = e.target;
            if (target.classList.contains('node-input-point') && dragStartOutlet) {
                // Trova il nodo di destinazione
                const targetNode = target.closest('.node, .socapex-wrapper');
                if (targetNode) {
                    const targetInstanceId = targetNode.id.replace('node-', '').replace('socapex-', '').split('-')[0];
                    const sourceInstanceId = dragStartOutlet.dataset.instanceId;
                    const outletIndex = dragStartOutlet.dataset.outletIndex;

                    if (targetInstanceId !== sourceInstanceId) {
                        // Crea collegamento
                        connectOutletToNode(parseInt(sourceInstanceId), parseInt(outletIndex), parseInt(targetInstanceId));
                    }
                }
            }

            dragStartOutlet = null;
        }
    });

    function connectOutletToNode(sourceInstanceId, outletIndex, targetInstanceId) {
        const sourceItem = workspaceItems.find(item => item.instanceId === sourceInstanceId);
        const targetItem = workspaceItems.find(item => item.instanceId === targetInstanceId);

        if (sourceItem && targetItem) {
            // Verifica compatibilità
            const sourceTemplate = switchboards.find(sw => sw.id === sourceItem.templateId);
            const targetTemplate = switchboards.find(sw => sw.id === targetItem.templateId);

            if (sourceTemplate && targetTemplate) {
                const outlet = sourceTemplate.outlets[outletIndex];
                const requiredInput = OUTLET_TO_INPUT_MAPPING[outlet.type];

                if (targetTemplate.input === requiredInput) {
                    // Scollega da eventuale genitore precedente
                    targetItem.parentId = sourceInstanceId;
                    targetItem.parentOutletKey = `${outletIndex}-0`;

                    saveWorkspaceItems();
                    renderSchema();

                    console.log(`Collegato ${sourceItem.instanceName || 'Quadro'} uscita ${outletIndex + 1} a ${targetItem.instanceName || 'Quadro'}`);
                } else {
                    alert(`Incompatibile: ${outlet.type} non può alimentare ${targetTemplate.input}`);
                }
            }
        }
    }

    // Zoom con rotella del mouse
    schemaContainer.addEventListener('wheel', (e) => {
        e.preventDefault();

        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        const newScale = scale * delta;

        if (newScale >= 0.3 && newScale <= 3) {
            const rect = schemaContainer.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;

            const oldX = (mouseX - translateX) / scale;
            const oldY = (mouseY - translateY) / scale;

            scale = newScale;

            translateX = mouseX - oldX * scale;
            translateY = mouseY - oldY * scale;

            updateTransform();
        }
    }, { passive: false });

    // Pan con rotella del mouse
    schemaContainer.addEventListener('mousedown', (e) => {
        if (e.button === 1) {
            e.preventDefault();
            isPanning = true;
            startPanX = e.clientX - translateX;
            startPanY = e.clientY - translateY;
            schemaContainer.style.cursor = 'grabbing';
        }
    });

    document.addEventListener('mousemove', (e) => {
        if (isPanning) {
            translateX = e.clientX - startPanX;
            translateY = e.clientY - startPanY;
            updateTransform();
        }
    });

    document.addEventListener('mouseup', (e) => {
        if (e.button === 1 && isPanning) {
            isPanning = false;
            schemaContainer.style.cursor = 'default';
        }
    });

    function updateTransform() {
        const canvas = schemaContainer.querySelector('.schema-canvas');
        if (canvas) {
            canvas.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;
            canvas.style.transformOrigin = '0 0';
        }
    }

    // Chiudi popover quando si clicca altrove
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.outlet-popover') && !e.target.classList.contains('outlet-dot')) {
            closeActivePopover();
        }
    });

    console.log('WorkspaceItems:', workspaceItems);
    console.log('Pulsanti:', {
        power: document.getElementById('add-power-supply-btn'),
        switchboard: document.getElementById('add-switchboard-btn'),
        load: document.getElementById('add-load-btn')
    });
    renderSchema();
    setTimeout(updateTransform, 100);

    // --- Pan, Drag, Selection Logic ---
    let isDragging = false;
    let isMarqueeSelecting = false;

    let potentialDragNode = null;
    let dragStartX = 0, dragStartY = 0;
    let panStartX = 0, panStartY = 0, scrollLeft = 0, scrollTop = 0;
    let marqueeBox = null, marqueeStartX = 0, marqueeStartY = 0;

    const selectedNodes = new Set();
    const positions = JSON.parse(localStorage.getItem('schema_positions')) || {};

    schemaContainer.addEventListener('mousedown', (e) => {
        // Check if clicking on control point
        if (e.target.tagName === 'circle' && e.target.dataset.lineId) {
            isDraggingControlPoint = true;
            activeControlPoint = e.target;
            e.preventDefault();
            return;
        }

        // Check if clicking on a line path (only if not clicking on a node)
        if (e.target.tagName === 'path' && e.target.dataset.lineId && e.button === 0) {
            const lineId = e.target.dataset.lineId;
            const group = e.target.closest('.line-group');

            // Deselect previous line
            if (selectedLine && selectedLine !== lineId) {
                const prevGroup = schemaContainer.querySelector(`.line-group[data-line-id="${selectedLine}"]`);
                if (prevGroup) {
                    prevGroup.querySelectorAll('.control-point').forEach(cp => cp.style.display = 'none');
                    const prevPath = prevGroup.querySelector('path');
                    if (prevPath) {
                        prevPath.setAttribute('stroke-width', '2');
                        prevPath.setAttribute('opacity', '0.6');
                    }
                }
            }

            // Select new line
            selectedLine = lineId;
            group.querySelectorAll('.control-point').forEach(cp => cp.style.display = 'block');
            e.target.setAttribute('stroke-width', '4');
            e.target.setAttribute('opacity', '1');

            // Bring SVG to front
            const svg = schemaContainer.querySelector('.connection-lines');
            if (svg) svg.style.zIndex = '1001';

            e.stopPropagation();
            return;
        }

        if (e.button !== 0) return; // Only left click for selection/drag

        const node = e.target.closest('.node, .socapex-wrapper');

        // Ignore clicks on inputs and inner load nodes
        if (e.target.closest('input, .power-supply-title, .sw-serial-input')) {
            return;
        }

        // Ignore clicks on load nodes inside socapex wrappers
        if (node && node.classList.contains('node-load') && node.closest('.socapex-wrapper')) {
            return;
        }

        if (node) {
            // Deselect line when clicking on a node
            if (selectedLine) {
                const prevGroup = schemaContainer.querySelector(`.line-group[data-line-id="${selectedLine}"]`);
                if (prevGroup) {
                    prevGroup.querySelectorAll('.control-point').forEach(cp => cp.style.display = 'none');
                    const prevPath = prevGroup.querySelector('path');
                    if (prevPath) {
                        prevPath.setAttribute('stroke-width', '2');
                        prevPath.setAttribute('opacity', '0.6');
                    }
                }

                // Reset SVG z-index
                const svg = schemaContainer.querySelector('.connection-lines');
                if (svg) svg.style.zIndex = '1';

                selectedLine = null;
            }

            // Click on a node, potential drag
            potentialDragNode = node;
            dragStartX = e.clientX;
            dragStartY = e.clientY;
        } else {
            // Click on background, start marquee selection
            isMarqueeSelecting = true;
            schemaContainer.classList.add('is-marquee-selecting');
            marqueeBox = document.createElement('div');
            marqueeBox.className = 'marquee-box';
            schemaContainer.appendChild(marqueeBox);

            const containerRect = schemaContainer.getBoundingClientRect();
            marqueeStartX = e.clientX - containerRect.left + schemaContainer.scrollLeft;
            marqueeStartY = e.clientY - containerRect.top + schemaContainer.scrollTop;

            marqueeBox.style.left = marqueeStartX + 'px';
            marqueeBox.style.top = marqueeStartY + 'px';
            marqueeBox.style.width = '0px';
            marqueeBox.style.height = '0px';

            if (!e.shiftKey) {
                selectedNodes.forEach(n => n.classList.remove('selected'));
                selectedNodes.clear();
            }
        }
        e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
        // Dragging control point
        if (isDraggingControlPoint && activeControlPoint) {
            e.preventDefault();
            const containerRect = schemaContainer.getBoundingClientRect();
            const x = (e.clientX - containerRect.left + schemaContainer.scrollLeft - translateX) / scale;
            const y = (e.clientY - containerRect.top + schemaContainer.scrollTop - translateY) / scale;

            activeControlPoint.setAttribute('cx', x);
            activeControlPoint.setAttribute('cy', y);

            const lineId = activeControlPoint.dataset.lineId;
            const cpType = activeControlPoint.dataset.cp;
            const path = schemaContainer.querySelector(`path[data-line-id="${lineId}"]`);

            if (path) {
                const pathData = path.getAttribute('d');
                const parts = pathData.match(/M ([\d.-]+) ([\d.-]+) C ([\d.-]+) ([\d.-]+), ([\d.-]+) ([\d.-]+), ([\d.-]+) ([\d.-]+)/);
                if (parts) {
                    let newPath;
                    if (cpType === 'cp1') {
                        newPath = `M ${parts[1]} ${parts[2]} C ${x} ${y}, ${parts[5]} ${parts[6]}, ${parts[7]} ${parts[8]}`;
                    } else {
                        newPath = `M ${parts[1]} ${parts[2]} C ${parts[3]} ${parts[4]}, ${x} ${y}, ${parts[7]} ${parts[8]}`;
                    }
                    path.setAttribute('d', newPath);
                }
            }
            return;
        }

        // Marquee Selection
        if (isMarqueeSelecting) {
            e.preventDefault();
            const containerRect = schemaContainer.getBoundingClientRect();
            const currentX = e.clientX - containerRect.left + schemaContainer.scrollLeft;
            const currentY = e.clientY - containerRect.top + schemaContainer.scrollTop;

            const left = Math.min(currentX, marqueeStartX);
            const top = Math.min(currentY, marqueeStartY);
            const width = Math.abs(currentX - marqueeStartX);
            const height = Math.abs(currentY - marqueeStartY);

            marqueeBox.style.left = left + 'px';
            marqueeBox.style.top = top + 'px';
            marqueeBox.style.width = width + 'px';
            marqueeBox.style.height = height + 'px';

            const marqueeRect = marqueeBox.getBoundingClientRect();
            const allNodes = schemaContainer.querySelectorAll('.node, .socapex-wrapper');
            allNodes.forEach(n => {
                // Skip load nodes inside socapex wrappers
                if (n.classList.contains('node-load') && n.closest('.socapex-wrapper')) {
                    return;
                }
                const nodeRect = n.getBoundingClientRect();
                if (marqueeRect.left < nodeRect.right && marqueeRect.right > nodeRect.left &&
                    marqueeRect.top < nodeRect.bottom && marqueeRect.bottom > nodeRect.top) {
                    n.classList.add('pre-selected');
                } else {
                    n.classList.remove('pre-selected');
                }
            });
            return;
        }

        // Dragging
        if (potentialDragNode && !isDragging) {
            const moveX = Math.abs(e.clientX - dragStartX);
            const moveY = Math.abs(e.clientY - dragStartY);

            if (moveX > 3 || moveY > 3) {
                isDragging = true;

                if (!selectedNodes.has(potentialDragNode)) {
                    selectedNodes.forEach(n => n.classList.remove('selected'));
                    selectedNodes.clear();
                    selectedNodes.add(potentialDragNode);
                    potentialDragNode.classList.add('selected');
                }

                // Phase 1: Measure everything BEFORE modifying DOM
                const dragUpdates = [];
                selectedNodes.forEach(n => {
                    if (getComputedStyle(n).position !== 'absolute') {
                        const rect = n.getBoundingClientRect();
                        const wrapper = n.closest('.schema-wrapper');
                        const refRect = wrapper ? wrapper.getBoundingClientRect() : schemaContainer.getBoundingClientRect();
                        const currentScale = wrapper ? scale : 1;
                        const currentLeft = (rect.left - refRect.left) / currentScale;
                        const currentTop = (rect.top - refRect.top) / currentScale;
                        const computedStyle = getComputedStyle(n);
                        const margin = `${computedStyle.marginTop} ${computedStyle.marginRight} ${computedStyle.marginBottom} ${computedStyle.marginLeft}`;

                        dragUpdates.push({
                            node: n,
                            rect: rect,
                            left: currentLeft,
                            top: currentTop,
                            margin: margin,
                            scale: currentScale, // Pass scale to Phase 2
                            needsGhost: true
                        });
                    } else {
                        // Already absolute, just check for ghost fallback
                        dragUpdates.push({
                            node: n,
                            needsGhost: false // Will check fallback separately or just skip
                        });
                    }
                });

                // Phase 2: Apply changes
                dragUpdates.forEach(update => {
                    const n = update.node;

                    if (update.needsGhost) {
                        // Check if placeholder exists (paranoid check)
                        let existingPlaceholder = null;
                        let prev = n.previousElementSibling;
                        while (prev) {
                            if (prev.classList.contains('node-placeholder') || prev.classList.contains('node-placeholder-ghost')) {
                                existingPlaceholder = prev;
                                break;
                            }
                            prev = prev.previousElementSibling;
                        }

                        if (!existingPlaceholder) {
                            const ghost = n.cloneNode(true);
                            ghost.id = '';
                            ghost.style.cssText = `
                                position: static !important; 
                                display: none !important; 
                                pointer-events: none !important; 
                                margin: ${update.margin} !important;
                                width: ${update.rect.width / update.scale}px !important;
                                height: ${update.rect.height / update.scale}px !important;
                                box-sizing: border-box !important;
                                flex: none !important;
                            `;
                            ghost.classList.add('node-placeholder-ghost');
                            ghost.querySelectorAll('[id]').forEach(el => el.id = '');
                            if (n.parentNode) n.parentNode.insertBefore(ghost, n);
                        }

                        n.style.position = 'absolute';
                        n.style.left = update.left + 'px';
                        n.style.top = update.top + 'px';
                        n.dataset.wasDragged = 'true';
                    } else {
                        // Fallback for already absolute nodes
                        if (getComputedStyle(n).position === 'absolute') {
                            let prev = n.previousElementSibling;
                            let hasPlaceholder = false;
                            while (prev) {
                                if (prev.classList.contains('node-placeholder') || prev.classList.contains('node-placeholder-ghost')) {
                                    hasPlaceholder = true;
                                    break;
                                }
                                prev = prev.previousElementSibling;
                            }

                            if (!hasPlaceholder) {
                                const rect = n.getBoundingClientRect();
                                // Determine scale again since we didn't capture it for this path
                                const wrapper = n.closest('.schema-wrapper');
                                const currentScale = wrapper ? scale : 1;

                                const ghost = n.cloneNode(true);
                                ghost.id = '';
                                ghost.style.cssText = `
                                    position: static !important; 
                                    display: none !important; 
                                    pointer-events: none !important; 
                                    margin: ${getComputedStyle(n).margin} !important;
                                    width: ${rect.width / currentScale}px !important;
                                    height: ${rect.height / currentScale}px !important;
                                    box-sizing: border-box !important;
                                    flex: none !important;
                                `;
                                ghost.classList.add('node-placeholder-ghost');
                                ghost.querySelectorAll('[id]').forEach(el => el.id = '');
                                if (n.parentNode) n.parentNode.insertBefore(ghost, n);
                            }
                        }
                    }

                    n.dataset.startLeft = parseFloat(n.style.left);
                    n.dataset.startTop = parseFloat(n.style.top);
                    n.style.cursor = 'grabbing';
                    n.style.zIndex = '1000';
                });
            }
        }

        if (isDragging) {
            e.preventDefault();
            // Adjust delta by scale
            const dx = (e.clientX - dragStartX) / scale;
            const dy = (e.clientY - dragStartY) / scale;

            selectedNodes.forEach(node => {
                const startX = parseFloat(node.dataset.startLeft || 0);
                const startY = parseFloat(node.dataset.startTop || 0);
                node.style.left = `${startX + dx}px`;
                node.style.top = `${startY + dy}px`;
            });
        }
    });

    document.addEventListener('mouseup', (e) => {
        // Control point drag end
        if (isDraggingControlPoint && activeControlPoint) {
            const lineId = activeControlPoint.dataset.lineId;
            const path = schemaContainer.querySelector(`path[data-line-id="${lineId}"]`);

            if (path) {
                const pathData = path.getAttribute('d');
                const parts = pathData.match(/M ([\d.-]+) ([\d.-]+) C ([\d.-]+) ([\d.-]+), ([\d.-]+) ([\d.-]+), ([\d.-]+) ([\d.-]+)/);
                if (parts) {
                    lineControlPoints[lineId] = {
                        cp1x: parseFloat(parts[3]),
                        cp1y: parseFloat(parts[4]),
                        cp2x: parseFloat(parts[5]),
                        cp2y: parseFloat(parts[6])
                    };
                    localStorage.setItem('line_control_points', JSON.stringify(lineControlPoints));
                }
            }

            isDraggingControlPoint = false;
            activeControlPoint = null;
            return;
        }

        // Marquee selection end
        if (isMarqueeSelecting) {
            schemaContainer.classList.remove('is-marquee-selecting');
            schemaContainer.querySelectorAll('.pre-selected').forEach(node => {
                if (!selectedNodes.has(node)) {
                    selectedNodes.add(node);
                    node.classList.add('selected');
                }
                node.classList.remove('pre-selected');
            });
            if (marqueeBox && marqueeBox.parentNode) marqueeBox.parentNode.removeChild(marqueeBox);
            isMarqueeSelecting = false;
            marqueeBox = null;
        }

        // Dragging end
        if (isDragging) {
            const positions = JSON.parse(localStorage.getItem('schema_positions')) || {};

            selectedNodes.forEach(node => {
                node.style.cursor = 'grab';
                node.style.zIndex = '2';

                // Save position
                if (node.id) {
                    positions[node.id] = {
                        left: node.style.left,
                        top: node.style.top,
                        wasDragged: 'true'
                    };
                }
            });

            localStorage.setItem('schema_positions', JSON.stringify(positions));
            setTimeout(drawConnections, 50);
        }
        // Click (not drag, not marquee)
        else if (potentialDragNode) {
            const node = potentialDragNode;
            if (e.shiftKey) {
                if (selectedNodes.has(node)) {
                    selectedNodes.delete(node);
                    node.classList.remove('selected');
                } else {
                    selectedNodes.add(node);
                    node.classList.add('selected');
                }
            } else {
                selectedNodes.forEach(n => n.classList.remove('selected'));
                selectedNodes.clear();
                selectedNodes.add(node);
                node.classList.add('selected');
            }
        }

        potentialDragNode = null;
        isDragging = false;
    });

    function alignParentChildHeight() {
        // Calcola offset con coordinate relative al contenitore per un allineamento stabile.
        const childColumns = schemaContainer.querySelectorAll('.schema-column[data-parent-id]');

        const getRelativeTop = (el, ancestor) => {
            let top = 0;
            let node = el;
            while (node && node !== ancestor) {
                top += node.offsetTop;
                node = node.offsetParent;
            }
            return top;
        };

        childColumns.forEach(column => {
            const oldSpacer = column.querySelector(':scope > .column-offset-spacer');
            if (oldSpacer) oldSpacer.remove();

            const parentId = column.dataset.parentId;
            const parentNode = document.querySelector(`#node-${parentId}`);
            if (!parentNode) return;

            // Trova il wrapper più vicino per avere un riferimento coerente
            const wrapper = column.closest('.schema-wrapper') || schemaContainer;
            const parentTop = getRelativeTop(parentNode, wrapper);
            const columnTop = getRelativeTop(column, wrapper);
            const offset = Math.max(0, Math.round(parentTop - columnTop));

            if (offset > 0) {
                const spacer = document.createElement('div');
                spacer.className = 'column-offset-spacer';
                spacer.style.height = `${offset}px`;
                spacer.style.display = 'block';
                spacer.style.width = '1px';
                spacer.style.flexShrink = '0';
                spacer.style.margin = '0';
                column.insertBefore(spacer, column.firstChild);
            }
        });
    }

    const resetBtn = document.getElementById('reset-positions-btn');
    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            if (confirm('Sei sicuro di voler resettare tutte le posizioni dei riquadri?')) {
                localStorage.removeItem('schema_positions');
                renderSchema();
                setTimeout(alignParentChildHeight, 150);
            }
        });
    }

    const centerViewBtn = document.getElementById('center-view-btn');
    if (centerViewBtn) {
        centerViewBtn.addEventListener('click', () => {
            translateX = 0;
            translateY = 0;
            scale = 1;
            updateTransform();
            // Redraw connections to ensure they are correct after reset
            setTimeout(drawConnections, 50);
        });
    }

    // Export PNG
    const exportPngBtn = document.getElementById('export-png-btn');
    if (exportPngBtn) {
        exportPngBtn.addEventListener('click', () => {
            const wrapper = document.querySelector('.schema-wrapper');
            if (!wrapper) return;

            // Store original styles to restore later
            const originalStyles = new Map();

            // Hide all ghost placeholders before export
            const ghosts = document.querySelectorAll('.node-placeholder-ghost');
            ghosts.forEach(g => g.style.display = 'none');

            // Change all switchboard and load cards to white background with black text
            const cards = wrapper.querySelectorAll('.node, .socapex-wrapper');
            cards.forEach(card => {
                originalStyles.set(card, {
                    backgroundColor: card.style.backgroundColor,
                    color: card.style.color
                });
                card.style.setProperty('background-color', '#ffffff', 'important');
                card.style.setProperty('color', '#000000', 'important');

                // Also change text color for all children
                const textElements = card.querySelectorAll('*');
                textElements.forEach(el => {
                    if (!originalStyles.has(el)) {
                        originalStyles.set(el, { color: el.style.color });
                    }
                    el.style.setProperty('color', '#000000', 'important');
                });
            });

            // Collect connection line data before export
            const connectionLines = [];

            // Top-level connections (power supply to switchboards)
            const topLevelItems = workspaceItems.filter(item => !item.parentId);
            topLevelItems.forEach(item => {
                const powerSupplyOutput = document.getElementById(`output-${item.instanceId}`);
                const switchboardInput = document.getElementById(`input-${item.instanceId}`);
                if (powerSupplyOutput && switchboardInput) {
                    const outputRect = powerSupplyOutput.getBoundingClientRect();
                    const inputRect = switchboardInput.getBoundingClientRect();
                    const wrapperRect = wrapper.getBoundingClientRect();

                    connectionLines.push({
                        x1: outputRect.left + outputRect.width / 2 - wrapperRect.left,
                        y1: outputRect.top + outputRect.height / 2 - wrapperRect.top,
                        x2: inputRect.left + inputRect.width / 2 - wrapperRect.left,
                        y2: inputRect.top + inputRect.height / 2 - wrapperRect.top
                    });
                }
            });

            // Switchboard outlet connections
            workspaceItems.forEach(item => {
                const swTemplate = switchboards.find(s => s.id === item.templateId);
                if (!swTemplate) return;

                swTemplate.outlets.forEach((outlet, outletIndex) => {
                    const outletDot = document.getElementById(`outlet-${item.instanceId}-${outletIndex}`);
                    if (!outletDot) return;

                    const outletRect = outletDot.getBoundingClientRect();
                    const wrapperRect = wrapper.getBoundingClientRect();
                    const startX = outletRect.left + outletRect.width / 2 - wrapperRect.left;
                    const startY = outletRect.top + outletRect.height / 2 - wrapperRect.top;

                    const outletKey = `${outletIndex}-0`;
                    const childSwitchboard = workspaceItems.find(child =>
                        child.parentId === item.instanceId && child.parentOutletKey === outletKey
                    );

                    if (childSwitchboard) {
                        const childInput = document.getElementById(`input-${childSwitchboard.instanceId}`);
                        if (childInput) {
                            const childRect = childInput.getBoundingClientRect();
                            connectionLines.push({
                                x1: startX,
                                y1: startY,
                                x2: childRect.left + childRect.width / 2 - wrapperRect.left,
                                y2: childRect.top + childRect.height / 2 - wrapperRect.top
                            });
                        }
                    }
                });
            });

            html2canvas(wrapper, {
                backgroundColor: '#ffffff',
                scale: 2,
                logging: false,
                useCORS: true,
                allowTaint: true,
                ignoreElements: (element) => {
                    return element.classList.contains('node-placeholder-ghost') ||
                        element.classList.contains('node-placeholder') ||
                        element.classList.contains('outlet-dot') ||
                        element.classList.contains('add-load-popover') ||
                        element.classList.contains('connection-lines'); // Ignore SVG
                }
            }).then(canvas => {
                // Draw connection lines on the canvas
                const ctx = canvas.getContext('2d');
                const scale = 2; // Match html2canvas scale

                ctx.strokeStyle = '#B8860B'; // Dark goldenrod
                ctx.lineWidth = 2 * scale;
                ctx.globalAlpha = 0.8;

                connectionLines.forEach(line => {
                    const x1 = line.x1 * scale;
                    const y1 = line.y1 * scale;
                    const x2 = line.x2 * scale;
                    const y2 = line.y2 * scale;

                    // Draw curved line using quadratic curve
                    ctx.beginPath();
                    ctx.moveTo(x1, y1);

                    const controlOffset = Math.abs(x2 - x1) * 0.5;
                    const cp1x = x1 + controlOffset;
                    const cp1y = y1;
                    const cp2x = x2 - controlOffset;
                    const cp2y = y2;

                    // Use bezier curve for smooth connection
                    ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x2, y2);
                    ctx.stroke();
                });

                // Restore all original styles
                originalStyles.forEach((styles, element) => {
                    if (element.tagName === 'path') {
                        if (styles.stroke) element.setAttribute('stroke', styles.stroke);
                    } else {
                        if (styles.backgroundColor !== undefined) element.style.backgroundColor = styles.backgroundColor;
                        if (styles.color !== undefined) element.style.color = styles.color;
                    }
                });

                ghosts.forEach(g => g.style.display = '');

                const link = document.createElement('a');
                link.download = 'schema-unifilare.png';
                link.href = canvas.toDataURL('image/png');
                link.click();
            }).catch(err => {
                // Restore on error
                originalStyles.forEach((styles, element) => {
                    if (element.tagName === 'path') {
                        if (styles.stroke) element.setAttribute('stroke', styles.stroke);
                    } else {
                        if (styles.backgroundColor !== undefined) element.style.backgroundColor = styles.backgroundColor;
                        if (styles.color !== undefined) element.style.color = styles.color;
                    }
                });

                ghosts.forEach(g => g.style.display = '');
                console.error('Export PNG failed:', err);
                alert('Errore durante l\'esportazione PNG.');
            });
        });
    }

    // Export PDF
    const exportPdfBtn = document.getElementById('export-pdf-btn');
    if (exportPdfBtn) {
        exportPdfBtn.addEventListener('click', () => {
            const wrapper = document.querySelector('.schema-wrapper');
            if (!wrapper) return;

            // Store original styles to restore later
            const originalStyles = new Map();

            // Hide all ghost placeholders before export
            const ghosts = document.querySelectorAll('.node-placeholder-ghost');
            ghosts.forEach(g => g.style.display = 'none');

            // Change all switchboard and load cards to white background with black text
            const cards = wrapper.querySelectorAll('.node, .socapex-wrapper');
            cards.forEach(card => {
                originalStyles.set(card, {
                    backgroundColor: card.style.backgroundColor,
                    color: card.style.color
                });
                card.style.setProperty('background-color', '#ffffff', 'important');
                card.style.setProperty('color', '#000000', 'important');

                // Also change text color for all children
                const textElements = card.querySelectorAll('*');
                textElements.forEach(el => {
                    if (!originalStyles.has(el)) {
                        originalStyles.set(el, { color: el.style.color });
                    }
                    el.style.setProperty('color', '#000000', 'important');
                });
            });

            // Collect connection line data before export
            const connectionLines = [];

            // Top-level connections (power supply to switchboards)
            const topLevelItems = workspaceItems.filter(item => !item.parentId);
            topLevelItems.forEach(item => {
                const powerSupplyOutput = document.getElementById(`output-${item.instanceId}`);
                const switchboardInput = document.getElementById(`input-${item.instanceId}`);
                if (powerSupplyOutput && switchboardInput) {
                    const outputRect = powerSupplyOutput.getBoundingClientRect();
                    const inputRect = switchboardInput.getBoundingClientRect();
                    const wrapperRect = wrapper.getBoundingClientRect();

                    connectionLines.push({
                        x1: outputRect.left + outputRect.width / 2 - wrapperRect.left,
                        y1: outputRect.top + outputRect.height / 2 - wrapperRect.top,
                        x2: inputRect.left + inputRect.width / 2 - wrapperRect.left,
                        y2: inputRect.top + inputRect.height / 2 - wrapperRect.top
                    });
                }
            });

            // Switchboard outlet connections
            workspaceItems.forEach(item => {
                const swTemplate = switchboards.find(s => s.id === item.templateId);
                if (!swTemplate) return;

                swTemplate.outlets.forEach((outlet, outletIndex) => {
                    const outletDot = document.getElementById(`outlet-${item.instanceId}-${outletIndex}`);
                    if (!outletDot) return;

                    const outletRect = outletDot.getBoundingClientRect();
                    const wrapperRect = wrapper.getBoundingClientRect();
                    const startX = outletRect.left + outletRect.width / 2 - wrapperRect.left;
                    const startY = outletRect.top + outletRect.height / 2 - wrapperRect.top;

                    const outletKey = `${outletIndex}-0`;
                    const childSwitchboard = workspaceItems.find(child =>
                        child.parentId === item.instanceId && child.parentOutletKey === outletKey
                    );

                    if (childSwitchboard) {
                        const childInput = document.getElementById(`input-${childSwitchboard.instanceId}`);
                        if (childInput) {
                            const childRect = childInput.getBoundingClientRect();
                            connectionLines.push({
                                x1: startX,
                                y1: startY,
                                x2: childRect.left + childRect.width / 2 - wrapperRect.left,
                                y2: childRect.top + childRect.height / 2 - wrapperRect.top
                            });
                        }
                    }
                });
            });

            html2canvas(wrapper, {
                backgroundColor: '#ffffff',
                scale: 2,
                logging: false,
                useCORS: true,
                allowTaint: true,
                ignoreElements: (element) => {
                    return element.classList.contains('node-placeholder-ghost') ||
                        element.classList.contains('node-placeholder') ||
                        element.classList.contains('outlet-dot') ||
                        element.classList.contains('add-load-popover') ||
                        element.classList.contains('connection-lines'); // Ignore SVG
                }
            }).then(canvas => {
                // Draw connection lines on the canvas
                const ctx = canvas.getContext('2d');
                const scale = 2; // Match html2canvas scale

                ctx.strokeStyle = '#B8860B'; // Dark goldenrod
                ctx.lineWidth = 2 * scale;
                ctx.globalAlpha = 0.8;

                connectionLines.forEach(line => {
                    const x1 = line.x1 * scale;
                    const y1 = line.y1 * scale;
                    const x2 = line.x2 * scale;
                    const y2 = line.y2 * scale;

                    // Draw curved line using quadratic curve
                    ctx.beginPath();
                    ctx.moveTo(x1, y1);

                    const controlOffset = Math.abs(x2 - x1) * 0.5;
                    const cp1x = x1 + controlOffset;
                    const cp1y = y1;
                    const cp2x = x2 - controlOffset;
                    const cp2y = y2;

                    // Use bezier curve for smooth connection
                    ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x2, y2);
                    ctx.stroke();
                });

                // Restore all original styles
                originalStyles.forEach((styles, element) => {
                    if (styles.backgroundColor !== undefined) element.style.backgroundColor = styles.backgroundColor;
                    if (styles.color !== undefined) element.style.color = styles.color;
                });

                ghosts.forEach(g => g.style.display = '');

                const imgData = canvas.toDataURL('image/png');
                const { jsPDF } = window.jspdf;
                const pdf = new jsPDF({
                    orientation: 'landscape',
                    unit: 'mm',
                    format: 'a4'
                });

                const imgProps = pdf.getImageProperties(imgData);
                const pdfWidth = pdf.internal.pageSize.getWidth();
                const pdfHeight = pdf.internal.pageSize.getHeight();

                // Calculate dimensions to fit page
                const ratio = imgProps.width / imgProps.height;
                let w = pdfWidth;
                let h = w / ratio;

                if (h > pdfHeight) {
                    h = pdfHeight;
                    w = h * ratio;
                }

                const x = (pdfWidth - w) / 2;
                const y = (pdfHeight - h) / 2;

                pdf.addImage(imgData, 'PNG', x, y, w, h);
                pdf.save('schema-unifilare.pdf');
            }).catch(err => {
                // Restore on error
                originalStyles.forEach((styles, element) => {
                    if (styles.backgroundColor !== undefined) element.style.backgroundColor = styles.backgroundColor;
                    if (styles.color !== undefined) element.style.color = styles.color;
                });

                ghosts.forEach(g => g.style.display = '');
                console.error('Export PDF failed:', err);
                alert('Errore durante l\'esportazione PDF.');
            });
        });
    }
});
