document.addEventListener('DOMContentLoaded', () => {
    // Caricamento dei dati dal localStorage
    const workspaceItems = JSON.parse(localStorage.getItem('powerload_setup')) || [];
    const switchboards = JSON.parse(localStorage.getItem('powerload_switchboards')) || [];
    const materials = JSON.parse(localStorage.getItem('powerload_materials')) || [];

    const reportContainer = document.getElementById('report-container');

    if (workspaceItems.length === 0) {
        reportContainer.innerHTML = '<p class="card">Nessun quadro presente nel setup. Aggiungine uno dalla pagina "Crea Setup Evento".</p>';
        return;
    }

    // --- MOTORE DI CALCOLO (riutilizzato da setup.js per coerenza) ---
    const INPUT_CAPACITY_AMPS = {
        'CEE 16A 5p': 16, 'CEE 32A 5p': 32, 'CEE 63A 5p': 63,
        'CEE 125A 5p': 125, 'Powerlock 400A': 400
    };
    const VOLTAGE = 230;

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
            aggregatedTotals.R.watts += childTotals.R.watts;
            aggregatedTotals.S.watts += childTotals.S.watts;
            aggregatedTotals.T.watts += childTotals.T.watts;
        });
        return aggregatedTotals;
    }
    
    // --- MOTORE DI RENDERING DEL REPORT ---
    
    function renderSwitchboardReport(item, calculatedTotals) {
        const swTemplate = switchboards.find(s => s.id === item.templateId);
        if (!swTemplate) return '';

        const maxAmps = INPUT_CAPACITY_AMPS[swTemplate.input] || Infinity;
        
        // Costruzione dell'header della card
        let headerHTML = `
            <div class="report-header">
                <h2>${swTemplate.name}</h2>
                ${item.instanceName ? `<h3>Nome: ${item.instanceName}</h3>` : ''}
                ${item.instanceIdentifier ? `<h4>ID: ${item.instanceIdentifier}</h4>` : ''}
            </div>`;

        // Costruzione delle barre di carico per fase
        let phasesHTML = '<div class="phase-report">';
        ['R', 'S', 'T'].forEach(phase => {
            const watts = calculatedTotals[phase].watts;
            const amps = watts / VOLTAGE;
            const percentage = maxAmps !== Infinity ? (amps / maxAmps) * 100 : 0;
            
            let barClass = 'safe';
            if (percentage > 95) barClass = 'danger';
            else if (percentage > 80) barClass = 'warning';

            phasesHTML += `
                <div class="phase-box">
                    <strong>FASE ${phase}</strong>
                    <div class="phase-values">${watts.toFixed(0)}W / ${amps.toFixed(2)}A</div>
                    <div class="load-bar-container">
                        <div class="load-bar ${barClass}" style="width: ${Math.min(percentage, 100)}%;"></div>
                    </div>
                    <span class="phase-percentage">${percentage.toFixed(1)}%</span>
                </div>`;
        });
        phasesHTML += '</div>';

        // Costruzione della lista dettagliata delle uscite
        let detailsHTML = '<div class="report-details"><h4>Dettaglio Uscite:</h4><ul>';
        swTemplate.outlets.forEach((outlet, outletIndex) => {
            const childBoard = workspaceItems.find(child => child.parentId === item.instanceId && child.parentOutletKey === `${outletIndex}-0`);

            if (childBoard) {
                // Se è collegato un altro quadro, lo renderizziamo in cascata
                const childTotals = calculateRecursiveTotals(childBoard, workspaceItems);
                detailsHTML += `
                    <li>
                        <strong>#${outletIndex + 1}: ${outlet.type}</strong> &rarr; Collegato Quadro ID: ${childBoard.instanceIdentifier || 'N/D'}
                        <div class="report-child-switchboard">
                            ${renderSwitchboardReport(childBoard, childTotals)}
                        </div>
                    </li>`;
            } else {
                // Altrimenti, mostriamo i carichi diretti
                if (outlet.type === 'Socapex') {
                    const socaId = (item.socapexIds && item.socapexIds[outletIndex]) || (outletIndex + 1);
                    let socapexDetails = `<div class="socapex-report-group"><h5>Uscita #${outletIndex + 1}: Socapex (ID: ${socaId})</h5><ul>`;
                    for (let ch = 0; ch < 6; ch++) {
                        const loads = item.loads[`${outletIndex}-${ch}`] || [];
                        // MODIFICA 1: Cambiato "Ch" in "SCPX" e "(Fase X)" in "(X)"
                        socapexDetails += `<li><strong>SCPX ${ch + 1} (${outlet.phases[ch]}):</strong>`; 
                        if (loads.length > 0) {
                            loads.forEach(load => {
                                const material = materials.find(m => m.id === load.materialId);
                                if (material) {
                                    const lineName = load.lineName ? `<em>${load.lineName}</em>: ` : '';
                                    socapexDetails += `<div>${lineName}${load.quantity}x ${material.name} (${load.quantity * material.watts}W)</div>`;
                                }
                            });
                        } else {
                            socapexDetails += `<div class="empty-line">--- Vuoto ---</div>`;
                        }
                        socapexDetails += `</li>`;
                    }
                    socapexDetails += `</ul></div>`;
                    detailsHTML += socapexDetails;
                } else {
                    const loads = item.loads[`${outletIndex}-0`] || [];
                    // MODIFICA 2: Cambiato "(Fase X)" in "(X)"
                    const phaseInfo = outlet.phase ? `(${outlet.phase})` : '(Trifase)';
                    detailsHTML += `<li><strong>#${outletIndex + 1}: ${outlet.type} ${phaseInfo}</strong>`;
                    if (loads.length > 0) {
                        loads.forEach(load => {
                            const material = materials.find(m => m.id === load.materialId);
                            if (material) {
                                const lineName = load.lineName ? `<em>${load.lineName}</em>: ` : '';
                                detailsHTML += `<div>${lineName}${load.quantity}x ${material.name} (${load.quantity * material.watts}W)</div>`;
                            }
                        });
                    } else {
                        detailsHTML += `<div class="empty-line">--- Vuoto ---</div>`;
                    }
                    detailsHTML += `</li>`;
                }
            }
        });
        detailsHTML += '</ul></div>';

        return `<div class="card report-card">${headerHTML}${phasesHTML}${detailsHTML}</div>`;
    }

    // --- Inizializzazione ---
    function generateFullReport() {
        reportContainer.innerHTML = '';
        const topLevelItems = workspaceItems.filter(item => !item.parentId);

        topLevelItems.forEach(item => {
            const totalLoads = calculateRecursiveTotals(item, workspaceItems);
            reportContainer.innerHTML += renderSwitchboardReport(item, totalLoads);
        });
    }

    generateFullReport();
});