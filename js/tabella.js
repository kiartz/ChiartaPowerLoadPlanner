document.addEventListener('DOMContentLoaded', () => {
    // Caricamento dati
    const workspaceItems = JSON.parse(localStorage.getItem('powerload_setup')) || [];
    const switchboards = JSON.parse(localStorage.getItem('powerload_switchboards')) || [];
    const materials = JSON.parse(localStorage.getItem('powerload_materials')) || [];

    // NUOVO: Funzione per ordinare i quadri gerarchicamente (DFS)
    function getHierarchicalOrder(items) {
        const sorted = [];
        const roots = items.filter(i => !i.parentId);

        const traverse = (item) => {
            sorted.push(item);
            const children = items.filter(child => child.parentId === item.instanceId);
            // Ordina i figli in base alla posizione dell'uscita (outletIndex-channelIndex)
            children.sort((a, b) => {
                if (!a.parentOutletKey || !b.parentOutletKey) return 0;
                const [aOut, aCh] = a.parentOutletKey.split('-').map(Number);
                const [bOut, bCh] = b.parentOutletKey.split('-').map(Number);
                if (aOut !== bOut) return aOut - bOut;
                return (aCh || 0) - (bCh || 0);
            });
            children.forEach(child => traverse(child));
        };

        roots.forEach(root => traverse(root));

        // Aggiungi eventuali orfani
        const visited = new Set(sorted.map(i => i.instanceId));
        items.forEach(i => {
            if (!visited.has(i.instanceId)) sorted.push(i);
        });

        return sorted;
    }

    const orderedWorkspaceItems = getHierarchicalOrder(workspaceItems);

    const container = document.getElementById('powersheet-container');
    const exportPdfBtn = document.getElementById('export-pdf-btn');
    const exportPngBtn = document.getElementById('export-png-btn');
    const exportCsvBtn = document.getElementById('export-csv-btn');
    const exportSinglePngBtn = document.getElementById('export-single-png-btn');
    const VOLTAGE = 230;

    // NUOVO: Mappa per la capacità massima degli ingressi
    const INPUT_CAPACITY_AMPS = {
        'CEE 16A 3p': 16,
        'CEE 32A 3p': 32,
        'CEE 63A 3p': 63,
        'CEE 16A 5p': 16,
        'CEE 32A 5p': 32,
        'CEE 63A 5p': 63,
        'CEE 125A 5p': 125,
        'Powerlock 400A': 400
    };

    // NUOVO: Funzione per calcolare i carichi diretti per fase
    function calculateDirectPhaseLoads(item) {
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
                } else { // Trifase
                    phaseTotals.R.watts += totalWattsForLoad / 3;
                    phaseTotals.S.watts += totalWattsForLoad / 3;
                    phaseTotals.T.watts += totalWattsForLoad / 3;
                }
            });
        });
        return phaseTotals;
    }

    // NUOVO: Funzione per calcolare i totali ricorsivi per fase
    function calculateRecursivePhaseTotals(item, allItems) {
        let aggregatedTotals = calculateDirectPhaseLoads(item);
        const children = allItems.filter(child => child.parentId === item.instanceId);
        children.forEach(child => {
            const childTotals = calculateRecursivePhaseTotals(child, allItems);

            // Determine how to add child totals to parent
            let parentOutletPhase = null;
            if (child.parentOutletKey) {
                const swTemplate = switchboards.find(s => s.id === item.templateId);
                if (swTemplate) {
                    const [outletIndex, channelIndex] = child.parentOutletKey.split('-').map(Number);
                    const outlet = swTemplate.outlets[outletIndex];
                    if (outlet) {
                        if (outlet.type.includes('Monofase')) {
                            parentOutletPhase = outlet.phase;
                        } else if (outlet.type === 'Socapex') {
                            parentOutletPhase = outlet.phases[channelIndex];
                        }
                    }
                }
            }

            if (parentOutletPhase) {
                // If parent outlet is single phase, ALL child loads go to that specific phase
                const totalChildWatts = childTotals.R.watts + childTotals.S.watts + childTotals.T.watts;
                aggregatedTotals[parentOutletPhase].watts += totalChildWatts;
            } else {
                ['R', 'S', 'T'].forEach(phase => aggregatedTotals[phase].watts += childTotals[phase].watts);
            }
        });
        return aggregatedTotals;
    }

    function calculateRecursiveTotalWatts(itemId, allItems) {
        const item = allItems.find(i => i.instanceId === itemId);
        if (!item) return 0;

        let directWatts = 0;
        Object.values(item.loads).flat().forEach(load => {
            const material = materials.find(m => m.id === load.materialId);
            if (material) {
                directWatts += material.watts * load.quantity;
            }
        });

        let childrenWatts = 0;
        const children = allItems.filter(child => child.parentId === itemId);
        children.forEach(child => {
            childrenWatts += calculateRecursiveTotalWatts(child.instanceId, allItems);
        });

        return directWatts + childrenWatts;
    }

    function renderPowerSheet() {
        if (workspaceItems.length === 0) {
            container.innerHTML = '<p class="card">Nessun quadro trovato nel setup.</p>';
            return;
        }

        const phaseTotalsMap = new Map();
        orderedWorkspaceItems.forEach(item => {
            phaseTotalsMap.set(item.instanceId, calculateRecursivePhaseTotals(item, workspaceItems));
        });

        const totalWattsMap = new Map();
        orderedWorkspaceItems.forEach(item => {
            totalWattsMap.set(item.instanceId, calculateRecursiveTotalWatts(item.instanceId, workspaceItems));
        });

        orderedWorkspaceItems.forEach(item => {
            const swTemplate = switchboards.find(s => s.id === item.templateId);
            if (!swTemplate) return;

            const socapexOutlets = [];
            const directOutlets = [];
            swTemplate.outlets.forEach((outlet, index) => {
                const outletData = { ...outlet, originalIndex: index };
                if (outlet.type === 'Socapex') {
                    socapexOutlets.push(outletData);
                } else {
                    directOutlets.push(outletData);
                }
            });

            if (socapexOutlets.length === 0 && directOutlets.length === 0) {
                return;
            }

            const powerboxSection = document.createElement('div');
            powerboxSection.className = 'powerbox-section card';
            powerboxSection.id = `powerbox-${item.instanceId}`;

            const powerboxName = item.instanceName || swTemplate.name;
            const powerboxInput = swTemplate.input;

            const SOCAPEX_PER_TABLE = 3;
            const socapexChunks = [];
            for (let i = 0; i < socapexOutlets.length; i += SOCAPEX_PER_TABLE) {
                socapexChunks.push(socapexOutlets.slice(i, i + SOCAPEX_PER_TABLE));
            }

            let finalHTML = '';
            socapexChunks.forEach((socaChunk, chunkIndex) => {
                let tableHTML = '<table class="spreadsheet-table">';
                tableHTML += '<thead><tr>';

                if (chunkIndex === 0) {
                    const instanceId = item.instanceIdentifier ? ` <span style="color: #d97706; font-weight: bold;">${item.instanceIdentifier}</span>` : '';
                    tableHTML += `<th rowspan="3" class="powerbox-name-cell">${powerboxName}${instanceId}<br><span>${swTemplate.name}</span></th>`;
                } else {
                    tableHTML += `<th rowspan="3" class="powerbox-name-cell"></th>`;
                }

                if (chunkIndex === 0) {
                    const phaseTotals = phaseTotalsMap.get(item.instanceId);
                    const isSinglePhase = swTemplate.input.includes('3p');

                    if (isSinglePhase) {
                        const totalWatts = phaseTotals.R.watts + phaseTotals.S.watts + phaseTotals.T.watts;
                        const maxAmps = INPUT_CAPACITY_AMPS[swTemplate.input] || Infinity;
                        const totalAmps = totalWatts / VOLTAGE;
                        const percentage = maxAmps !== Infinity ? (totalAmps / maxAmps) * 100 : 0;

                        let barClass = '';
                        if (percentage > 95) barClass = 'phase-danger';
                        else if (percentage > 80) barClass = 'phase-warning';
                        else if (percentage > 0) barClass = 'phase-safe';

                        tableHTML += `<td colspan="12" class="phase-total-cell ${barClass}" style="text-align: center;">
                                        <strong>Total Load:</strong> ${totalWatts.toFixed(0)}W / ${totalAmps.toFixed(2)}A
                                     </td>`;
                    } else {
                        ['R', 'S', 'T'].forEach(phase => {
                            const maxAmps = INPUT_CAPACITY_AMPS[swTemplate.input] || Infinity;
                            const watts = phaseTotals[phase].watts;
                            const amps = watts / VOLTAGE;
                            const percentage = maxAmps !== Infinity ? (amps / maxAmps) * 100 : 0;

                            let barClass = '';
                            if (percentage > 95) barClass = 'phase-danger';
                            else if (percentage > 80) barClass = 'phase-warning';
                            else if (percentage > 0) barClass = 'phase-safe';

                            tableHTML += `<td colspan="4" class="phase-total-cell ${barClass}">
                                            <strong>${phase}:</strong> ${watts.toFixed(0)}W / ${amps.toFixed(2)}A
                                         </td>`;
                        });
                    }
                } else {
                    tableHTML += `<td colspan="4" class="phase-total-cell"></td>`;
                    tableHTML += `<td colspan="4" class="phase-total-cell"></td>`;
                    tableHTML += `<td colspan="4" class="phase-total-cell"></td>`;
                }
                tableHTML += '</tr><tr>';
                socaChunk.forEach((soca, i) => {
                    const socaId = (item.socapexIds && item.socapexIds[soca.originalIndex]) || `Soca ${String.fromCharCode(65 + (chunkIndex * SOCAPEX_PER_TABLE) + i)}`;
                    tableHTML += `<th colspan="4" class="soca-header soca-header-${i % 6}">${socaId}</th>`;
                });
                tableHTML += '</tr><tr>';
                socaChunk.forEach((soca, i) => {
                    tableHTML += `<th class="soca-subheader soca-col-${i % 6} line-col">Linea</th><th class="soca-subheader soca-col-${i % 6} material-col">Materiale</th><th class="soca-subheader soca-col-${i % 6} qta-col">QTA</th><th class="soca-subheader soca-col-${i % 6} watt-col">WATT</th>`;
                });
                tableHTML += '</tr></thead>';

                tableHTML += '<tbody>';
                const maxRows = 6;
                for (let i = 0; i < maxRows; i++) {
                    tableHTML += '<tr>';
                    let firstCellContent = i + 1;
                    tableHTML += `<td class="channel-number-cell">${firstCellContent}</td>`;

                    socaChunk.forEach((soca, socaIndex) => {
                        if (i < 6) {
                            const socaId = (item.socapexIds && item.socapexIds[soca.originalIndex]) || String.fromCharCode(65 + (chunkIndex * SOCAPEX_PER_TABLE) + socaIndex);
                            const lineId = `${socaId}.${i + 1}`;
                            tableHTML += `<td class="soca-col-${socaIndex % 6} line-col"><strong>${lineId}</strong></td>`;
                            const loadKey = `${soca.originalIndex}-${i}`;
                            const loads = item.loads[loadKey] || [];
                            let material = '---', qta = '---', watt = '---';
                            if (loads.length > 0) {
                                material = '';
                                qta = '';
                                let totalWatt = 0;
                                loads.forEach(load => {
                                    const mat = materials.find(m => m.id === load.materialId);
                                    if (mat) {
                                        const lineNameHighlight = load.lineName ? ` <strong class="line-name-highlight">(${load.lineName})</strong>` : '';
                                        material += `<div>${mat.name}${lineNameHighlight}</div>`;
                                        qta += `<div>${load.quantity}</div>`;
                                        totalWatt += load.quantity * mat.watts;
                                    }
                                });
                                watt = totalWatt > 0 ? totalWatt.toFixed(0) : '---';
                            }
                            tableHTML += `<td class="soca-col-${socaIndex % 6} material-col">${material}</td><td class="soca-col-${socaIndex % 6} qta-col">${qta}</td><td class="soca-col-${socaIndex % 6} watt-col">${watt}</td>`;
                        } else {
                            tableHTML += `<td class="soca-col-${socaIndex % 6} line-col empty-fill"></td><td class="soca-col-${socaIndex % 6} material-col empty-fill"></td><td class="soca-col-${socaIndex % 6} qta-col empty-fill"></td><td class="soca-col-${socaIndex % 6} watt-col empty-fill"></td>`;
                        }
                    });

                    tableHTML += '</tr>';
                }
                tableHTML += '</tbody></table>';
                finalHTML += tableHTML;
            });

            if (directOutlets.length > 0) {
                let directTableHTML = '<table class="spreadsheet-table direct-outlets-table">';
                directTableHTML += '<thead><tr>';
                if (socapexOutlets.length === 0) {
                    const instanceId = item.instanceIdentifier ? ` <span style="color: #d97706; font-weight: bold;">${item.instanceIdentifier}</span>` : '';
                    directTableHTML += `<th rowspan="3" class="powerbox-name-cell">${powerboxName}${instanceId}<br><span>${swTemplate.name}</span></th>`;
                    const phaseTotals = phaseTotalsMap.get(item.instanceId);
                    const isSinglePhase = swTemplate.input.includes('3p');

                    if (isSinglePhase) {
                        const totalWatts = phaseTotals.R.watts + phaseTotals.S.watts + phaseTotals.T.watts;
                        const maxAmps = INPUT_CAPACITY_AMPS[swTemplate.input] || Infinity;
                        const totalAmps = totalWatts / VOLTAGE;
                        const percentage = maxAmps !== Infinity ? (totalAmps / maxAmps) * 100 : 0;

                        let barClass = '';
                        if (percentage > 95) barClass = 'phase-danger';
                        else if (percentage > 80) barClass = 'phase-warning';
                        else if (percentage > 0) barClass = 'phase-safe';

                        directTableHTML += `<td colspan="4" class="totals-wrapper-cell"><table class="nested-totals-table"><tr>
                                                <td class="phase-total-cell ${barClass}" style="width: 100%; text-align: center;"><strong>Total Load:</strong> ${totalWatts.toFixed(0)}W / ${totalAmps.toFixed(2)}A</td>
                                             </tr></table></td>`;
                    } else {
                        directTableHTML += `<td colspan="4" class="totals-wrapper-cell"><table class="nested-totals-table"><tr>`;
                        ['R', 'S', 'T'].forEach(phase => {
                            const maxAmps = INPUT_CAPACITY_AMPS[swTemplate.input] || Infinity;
                            const watts = phaseTotals[phase].watts;
                            const amps = watts / VOLTAGE;
                            const percentage = maxAmps !== Infinity ? (amps / maxAmps) * 100 : 0;

                            let barClass = '';
                            if (percentage > 95) barClass = 'phase-danger';
                            else if (percentage > 80) barClass = 'phase-warning';
                            else if (percentage > 0) barClass = 'phase-safe';

                            directTableHTML += `<td class="phase-total-cell ${barClass}"><strong>${phase}:</strong> ${watts.toFixed(0)}W / ${amps.toFixed(2)}A</td>`;
                        });
                        directTableHTML += `</tr></table></td>`;
                    }
                } else {
                    directTableHTML += `<th rowspan="3" class="powerbox-name-cell"></th>`;
                    directTableHTML += `<td colspan="4"></td>`;
                }
                directTableHTML += `</tr><tr><th colspan="4" class="soca-header direct-header">Uscite Dirette</th></tr><tr>`;
                directTableHTML += `
                    <th class="soca-subheader direct-col line-col">Linea</th>
                    <th class="soca-subheader direct-col material-col">Materiale</th>
                    <th class="soca-subheader direct-col qta-col">QTA</th>
                    <th class="soca-subheader direct-col watt-col">WATT</th>
                </tr></thead>`;

                directTableHTML += '<tbody>';
                directOutlets.forEach((outlet, i) => {
                    directTableHTML += '<tr>';
                    const outletType = outlet.type;
                    const typeSpan = `<span class="channel-outlet-type">${outletType}</span>`;
                    const firstCellContent = `<strong>${i + 1}</strong>${typeSpan}`;
                    directTableHTML += `<td class="channel-number-cell">${firstCellContent}</td>`;

                    const boardIdentifier = item.instanceIdentifier || 'Q';
                    const lineId = `${boardIdentifier}-${i + 1}`;
                    directTableHTML += `<td class="direct-col line-col"><strong>${lineId}</strong></td>`;

                    const loadKey = `${outlet.originalIndex}-0`;
                    const loads = item.loads[loadKey] || [];
                    const childBoard = workspaceItems.find(child => child.parentId === item.instanceId && child.parentOutletKey === loadKey);

                    if (childBoard) {
                        const childTotalWatts = totalWattsMap.get(childBoard.instanceId) || 0;
                        const childTemplate = switchboards.find(s => s.id === childBoard.templateId);
                        const childTemplateName = childTemplate ? childTemplate.name : 'Quadro';
                        const linkText = `&rarr; ${childTemplateName} - ${childBoard.instanceName || ''} (ID: ${childBoard.instanceIdentifier || 'N/D'})`;
                        directTableHTML += `<td class="direct-col material-col"><a href="#powerbox-${childBoard.instanceId}" class="jumplink">${linkText}</a></td><td class="direct-col qta-col"><strong>1</strong></td><td class="direct-col watt-col"><strong>${childTotalWatts.toFixed(0)}</strong></td>`;
                    } else if (loads.length > 0) {
                        let material = '', totalWattOnOutlet = 0, qta = '';
                        loads.forEach(load => {
                            const mat = materials.find(m => m.id === load.materialId);
                            if (mat) {
                                const lineNameHighlight = load.lineName ? ` <strong class="line-name-highlight">(${load.lineName})</strong>` : '';
                                material += `<div>${mat.name}${lineNameHighlight}</div>`;
                                qta += `<div>${load.quantity}</div>`;
                                totalWattOnOutlet += load.quantity * mat.watts;
                            }
                        });
                        directTableHTML += `<td class="direct-col material-col">${material}</td><td class="direct-col qta-col">${qta}</td><td class="direct-col watt-col">${totalWattOnOutlet}</td>`;
                    } else {
                        directTableHTML += `<td class="direct-col material-col empty-direct-cell"></td><td class="direct-col qta-col empty-direct-cell"></td><td class="direct-col watt-col empty-direct-cell"></td>`;
                    }
                    directTableHTML += '</tr>';
                });
                directTableHTML += '</tbody></table>';
                finalHTML += directTableHTML;
            }

            powerboxSection.innerHTML = finalHTML;
            container.appendChild(powerboxSection);
        });
    }

    container.addEventListener('click', (e) => {
        const jumplink = e.target.closest('a.jumplink');
        if (jumplink) {
            e.preventDefault();
            const targetId = jumplink.getAttribute('href').substring(1);
            const targetElement = document.getElementById(targetId);
            if (targetElement) {
                targetElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
                targetElement.classList.add('highlight');
                setTimeout(() => {
                    targetElement.classList.remove('highlight');
                }, 1500);
            }
        }
    });

    // NUOVO: Logica per l'esportazione in PNG
    exportPngBtn.addEventListener('click', () => {
        // Aggiungi la classe per lo stile di stampa (tema chiaro)
        document.body.classList.add('pdf-export');

        // NUOVO: Crea un'intestazione temporanea per l'export PNG
        const projectMeta = JSON.parse(localStorage.getItem('powerload_projectMeta')) || {};
        const headerParts = [];
        if (projectMeta.name) headerParts.push(`<strong>Progetto:</strong> ${projectMeta.name}`);
        if (projectMeta.location) headerParts.push(`<strong>Luogo:</strong> ${projectMeta.location}`);
        if (projectMeta.version) headerParts.push(`<strong>Versione:</strong> ${projectMeta.version}`);

        const headerElement = document.createElement('div');
        if (headerParts.length > 0) {
            headerElement.innerHTML = headerParts.join(' &nbsp; | &nbsp; ');
            headerElement.style.padding = '20px';
            headerElement.style.textAlign = 'center';
            headerElement.style.fontSize = '1.5em'; // Aumentata la dimensione del font
            headerElement.style.color = '#000000'; // CORREZIONE: Assicura che il testo sia nero
        }

        const element = document.getElementById('powersheet-container');
        const fileName = (projectMeta.name || 'PowerSheet').replace(/\s+/g, '_') + '.png';

        const options = {
            scale: 2, // Aumenta la risoluzione dell'immagine
            useCORS: true,
            backgroundColor: '#ffffff'
        };

        exportPngBtn.disabled = true;
        exportPngBtn.textContent = 'Creazione PNG...';

        // NUOVO: Aggiungi l'intestazione prima di creare il canvas
        element.prepend(headerElement);

        html2canvas(element, options).then(canvas => {
            // Crea un link per il download
            const a = document.createElement('a');
            a.href = canvas.toDataURL('image/png');
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);

        }).catch(err => {
            console.error("Errore durante la creazione del PNG:", err);
            alert("Si è verificato un errore durante la creazione del PNG.");
        }).finally(() => {
            // NUOVO: Rimuovi l'intestazione temporanea
            element.removeChild(headerElement);

            // Rimuovi la classe per lo stile di stampa
            document.body.classList.remove('pdf-export');

            // Riabilita il pulsante
            exportPngBtn.disabled = false;
            exportPngBtn.textContent = '🖼️ Esporta in PNG';
        });
    });

    // NUOVO: Funzione per esportare un singolo elemento in PNG
    async function exportElementToPng(element, fileName, withHeader = true) {
        let headerElement = null;

        if (withHeader) {
            const projectMeta = JSON.parse(localStorage.getItem('powerload_projectMeta')) || {};
            const headerParts = [];
            if (projectMeta.name) headerParts.push(`<strong>Progetto:</strong> ${projectMeta.name}`);
            if (projectMeta.location) headerParts.push(`<strong>Luogo:</strong> ${projectMeta.location}`);
            if (projectMeta.version) headerParts.push(`<strong>Versione:</strong> ${projectMeta.version}`);

            headerElement = document.createElement('div');
            if (headerParts.length > 0) {
                headerElement.innerHTML = headerParts.join(' &nbsp; | &nbsp; ');
                headerElement.style.padding = '20px';
                headerElement.style.textAlign = 'center';
                headerElement.style.fontSize = '1.5em';
                headerElement.style.color = '#000000';
            }
        }

        const options = {
            scale: 2,
            useCORS: true,
            backgroundColor: '#ffffff'
        };

        if (headerElement) {
            element.prepend(headerElement);
        }

        try {
            const canvas = await html2canvas(element, options);
            const a = document.createElement('a');
            a.href = canvas.toDataURL('image/png');
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        } finally {
            if (headerElement) {
                element.removeChild(headerElement);
            }
        }
    }

    // NUOVO: Logica per l'esportazione delle tabelle singole in PNG
    exportSinglePngBtn.addEventListener('click', async () => {
        if (typeof JSZip === 'undefined') {
            alert('La libreria per la creazione di file ZIP non è stata caricata. Controlla la connessione internet e riprova.');
            return;
        }

        document.body.classList.add('pdf-export');
        exportSinglePngBtn.disabled = true;
        exportSinglePngBtn.textContent = 'Creazione ZIP...';

        const powerboxSections = document.querySelectorAll('.powerbox-section');
        const projectMeta = JSON.parse(localStorage.getItem('powerload_projectMeta')) || {};
        const projectName = (projectMeta.name || 'PowerSheet').replace(/\s+/g, '_');
        const zip = new JSZip();

        try {
            for (const section of powerboxSections) {
                const instanceId = section.id.replace('powerbox-', '');
                const item = workspaceItems.find(i => i.instanceId == instanceId);
                const swTemplate = item ? switchboards.find(s => s.id === item.templateId) : null;
                const powerboxName = (item?.instanceName || swTemplate?.name || `Quadro_${instanceId}`).replace(/\s+/g, '_');
                const fileName = `${projectName}_${powerboxName}.png`;

                // Genera il canvas dell'immagine senza scaricarlo
                const canvas = await html2canvas(section, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
                const dataUrl = canvas.toDataURL('image/png');
                const imageData = dataUrl.split(',')[1]; // Rimuovi il prefisso "data:image/png;base64,"

                // Aggiungi l'immagine allo zip
                zip.file(fileName, imageData, { base64: true });
            }

            // Genera e scarica il file ZIP
            const zipBlob = await zip.generateAsync({ type: 'blob', mimeType: 'application/zip' });
            const zipFileName = `${projectName}_Tabelle.zip`;
            const link = document.createElement('a');
            link.href = URL.createObjectURL(zipBlob);
            link.download = zipFileName;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(link.href);

        } catch (err) {
            console.error("Errore durante la creazione del file ZIP:", err);
            alert("Si è verificato un errore durante la creazione del file ZIP.");
        } finally {
            document.body.classList.remove('pdf-export');
            exportSinglePngBtn.disabled = false;
            exportSinglePngBtn.textContent = '🗜️ Esporta Tabelle in ZIP';
        }
    });

    exportPdfBtn.addEventListener('click', () => {
        // Aggiungi la classe per lo stile di stampa
        document.body.classList.add('pdf-export');

        // Aggiungi uno spacer temporaneo alla fine del container per evitare
        // che html2pdf tagli l'ultimo elemento.
        const spacer = document.createElement('div');
        spacer.style.height = '100px';
        // NUOVO: Recupera i metadati del progetto per l'intestazione
        const projectMeta = JSON.parse(localStorage.getItem('powerload_projectMeta')) || {};
        const headerParts = [];
        if (projectMeta.name) headerParts.push(projectMeta.name);
        if (projectMeta.location) headerParts.push(projectMeta.location);
        if (projectMeta.version) headerParts.push(`v${projectMeta.version}`);
        const headerText = headerParts.join(' - ') || 'Progetto PowerSheet';

        const element = document.getElementById('powersheet-container');
        element.appendChild(spacer);

        const opt = {
            // MODIFICA: Aumentato il margine superiore per fare spazio all'intestazione
            // Il formato è [top, left, bottom, right] in pollici.
            margin: [0.5, 0.2, 0.4, 0.3],
            filename: 'PowerSheet_Excel.pdf',
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
            jsPDF: { unit: 'in', format: 'a2', orientation: 'portrait', putOnlyUsedFonts: true, floatPrecision: 16 }
        };

        exportPdfBtn.disabled = true;
        exportPdfBtn.textContent = 'Creazione PDF...';

        html2pdf().set(opt).from(element).toPdf().get('pdf').then(pdf => {
            // NUOVO: Aggiunge intestazione e piè di pagina a ogni pagina
            const totalPages = pdf.internal.getNumberOfPages();
            const pageWidth = pdf.internal.pageSize.getWidth();
            const pageHeight = pdf.internal.pageSize.getHeight();

            for (let i = 1; i <= totalPages; i++) {
                pdf.setPage(i);

                // Intestazione (Nome Progetto)
                pdf.setFontSize(18); // Dimensione intermedia per l'intestazione
                pdf.setTextColor(100); // Grigio
                // Spostato un po' più in basso per dare spazio
                pdf.text(headerText, pageWidth / 2, 0.3, { align: 'center' });

                // Piè di pagina (Numero Pagina)
                const footerText = `Pagina ${i} di ${totalPages}`;
                pdf.setFontSize(10); // Dimensione ridotta per il piè di pagina
                pdf.text(footerText, pageWidth / 2, pageHeight - 0.15, { align: 'center' });
            }
        }).save().finally(() => {
            // Rimuovi lo spacer
            element.removeChild(spacer);

            // Rimuovi la classe per lo stile di stampa, sia in caso di successo che di errore
            document.body.classList.remove('pdf-export');

            // Riabilita il pulsante
            exportPdfBtn.disabled = false;
            exportPdfBtn.textContent = '📄 Esporta in PDF';
        });
    });

    // NUOVO: Logica per l'esportazione in CSV
    exportCsvBtn.addEventListener('click', () => {
        exportCsvBtn.disabled = true;
        exportCsvBtn.textContent = 'Creazione CSV...';

        // Funzione per gestire i valori nulli e le virgole
        const escapeCsvCell = (cell) => {
            if (cell === null || cell === undefined) {
                return '';
            }
            const str = String(cell);
            // Se la cella contiene una virgola, un a capo o le virgolette, la racchiude tra virgolette
            if (str.includes(',') || str.includes('"') || str.includes('\n')) {
                return `"${str.replace(/"/g, '""')}"`; // Le virgolette interne vengono raddoppiate
            }
            return str;
        };

        try {
            const csvRows = [];
            const phaseTotalsMap = new Map();
            orderedWorkspaceItems.forEach(item => {
                phaseTotalsMap.set(item.instanceId, calculateRecursivePhaseTotals(item, workspaceItems));
            });
            const totalWattsMap = new Map();
            orderedWorkspaceItems.forEach(item => {
                totalWattsMap.set(item.instanceId, calculateRecursiveTotalWatts(item.instanceId, workspaceItems));
            });

            orderedWorkspaceItems.forEach(item => {
                const swTemplate = switchboards.find(s => s.id === item.templateId);
                if (!swTemplate) return;

                const socapexOutlets = swTemplate.outlets.map((o, i) => ({ ...o, originalIndex: i })).filter(o => o.type === 'Socapex');
                const directOutlets = swTemplate.outlets.map((o, i) => ({ ...o, originalIndex: i })).filter(o => o.type !== 'Socapex');

                if (socapexOutlets.length === 0 && directOutlets.length === 0) return;

                const SOCAPEX_PER_TABLE = 3;
                const socapexChunks = [];
                for (let i = 0; i < socapexOutlets.length; i += SOCAPEX_PER_TABLE) {
                    socapexChunks.push(socapexOutlets.slice(i, i + SOCAPEX_PER_TABLE));
                }

                socapexChunks.forEach((socaChunk, chunkIndex) => {
                    const powerboxName = item.instanceName || swTemplate.name;
                    const powerboxInput = swTemplate.input;

                    // Riga 1: Nome Quadro e Totali Fase
                    const row1 = [];
                    if (chunkIndex === 0) {
                        row1.push(`${powerboxName} (${powerboxInput})`);
                        const phaseTotals = phaseTotalsMap.get(item.instanceId);
                        ['R', 'S', 'T'].forEach(phase => {
                            const watts = phaseTotals[phase].watts;
                            const amps = watts / VOLTAGE;
                            row1.push(`${phase}: ${watts.toFixed(0)}W / ${amps.toFixed(2)}A`, '', '', '');
                        });
                    } else {
                        row1.push('', '', '', '', '', '', '', '', '', '', '', '', '');
                    }
                    csvRows.push(row1.map(escapeCsvCell).join(','));

                    // Riga 2: Intestazioni Socapex
                    const row2 = ['']; // Cella vuota per allineamento
                    socaChunk.forEach((soca, i) => {
                        const socaId = (item.socapexIds && item.socapexIds[soca.originalIndex]) || `Soca ${String.fromCharCode(65 + (chunkIndex * SOCAPEX_PER_TABLE) + i)}`;
                        row2.push(socaId, '', '', '');
                    });
                    csvRows.push(row2.map(escapeCsvCell).join(','));

                    // Riga 3: Sotto-intestazioni (Linea, Materiale, etc.)
                    const row3 = ['']; // Cella vuota per allineamento
                    socaChunk.forEach(() => {
                        row3.push('Linea', 'Materiale', 'QTA', 'WATT');
                    });
                    csvRows.push(row3.map(escapeCsvCell).join(','));

                    // Righe 4-9: Dati dei canali
                    for (let i = 0; i < 6; i++) {
                        const row = [i + 1];
                        socaChunk.forEach((soca, socaIndex) => {
                            const socaId = (item.socapexIds && item.socapexIds[soca.originalIndex]) || String.fromCharCode(65 + (chunkIndex * SOCAPEX_PER_TABLE) + socaIndex);
                            row.push(`${socaId}.${i + 1}`);
                            const loadKey = `${soca.originalIndex}-${i}`;
                            const loads = item.loads[loadKey] || [];
                            if (loads.length > 0) {
                                const materialTexts = [];
                                const qtaTexts = [];
                                let totalWatt = 0;
                                loads.forEach(load => {
                                    const mat = materials.find(m => m.id === load.materialId);
                                    if (mat) {
                                        const lineName = load.lineName ? ` (${load.lineName})` : '';
                                        materialTexts.push(`${mat.name}${lineName}`);
                                        qtaTexts.push(load.quantity);
                                        totalWatt += load.quantity * mat.watts;
                                    }
                                });
                                row.push(materialTexts.join('\n'), qtaTexts.join('\n'), totalWatt.toFixed(0));
                            } else {
                                row.push('---', '---', '---');
                            }
                        });
                        csvRows.push(row.map(escapeCsvCell).join(','));
                    }
                });

                // Tabella separata per le uscite dirette
                if (directOutlets.length > 0) {
                    csvRows.push([]); // Riga vuota di separazione
                    const headerRow = ['Uscita', 'Tipo', 'Linea', 'Materiale / Collegamento', 'QTA', 'WATT'];
                    csvRows.push(headerRow.map(escapeCsvCell).join(','));

                    directOutlets.forEach((outlet, i) => {
                        const row = [];
                        row.push(i + 1, outlet.type);
                        const boardIdentifier = item.instanceIdentifier || 'Q';
                        row.push(`${boardIdentifier}-${i + 1}`);

                        const loadKey = `${outlet.originalIndex}-0`;
                        const childBoard = workspaceItems.find(child => child.parentId === item.instanceId && child.parentOutletKey === loadKey);

                        if (childBoard) {
                            const childTotalWatts = totalWattsMap.get(childBoard.instanceId) || 0;
                            const childTemplate = switchboards.find(s => s.id === childBoard.templateId);
                            const childTemplateName = childTemplate ? childTemplate.name : 'Quadro';
                            const linkText = `-> ${childTemplate?.name || ''} - ${childBoard.instanceName || ''} (ID: ${childBoard.instanceIdentifier || 'N/D'})`;
                            row.push(linkText, '1', childTotalWatts.toFixed(0));
                        } else {
                            const loads = item.loads[loadKey] || [];
                            if (loads.length > 0) {
                                const materialTexts = [], qtaTexts = [];
                                let totalWatt = 0;
                                loads.forEach(load => {
                                    const mat = materials.find(m => m.id === load.materialId);
                                    if (mat) {
                                        const lineName = load.lineName ? ` (${load.lineName})` : '';
                                        materialTexts.push(`${mat.name}${lineName}`);
                                        qtaTexts.push(load.quantity);
                                        totalWatt += load.quantity * mat.watts;
                                    }
                                });
                                row.push(materialTexts.join('\n'), qtaTexts.join('\n'), totalWatt.toFixed(0));
                            } else {
                                row.push('---', '---', '---');
                            }
                        }
                        csvRows.push(row.map(escapeCsvCell).join(','));
                    });
                }
                csvRows.push([]); // Aggiunge una riga vuota tra un quadro e l'altro
            });

            const csvString = csvRows.join('\n');
            const projectMeta = JSON.parse(localStorage.getItem('powerload_projectMeta')) || {};
            const fileName = (projectMeta.name || 'PowerSheet').replace(/\s+/g, '_') + '.csv';
            const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.setAttribute('download', fileName);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

        } catch (err) {
            console.error("Errore durante la creazione del CSV:", err);
            alert("Si è verificato un errore durante la creazione del CSV.");
        } finally {
            exportCsvBtn.disabled = false;
            exportCsvBtn.textContent = '📊 Esporta in CSV';
        }
    });

    renderPowerSheet();
});