/**
 * PowerLoad Planner - Core Logic
 * Shared functions for calculations and utilities.
 */

const PLP_CORE = {
    /**
     * Calculates the direct power load on a switchboard instance (not including children).
     * @param {Object} item - The workspace item (switchboard instance).
     * @param {Array} switchboards - List of switchboard templates.
     * @param {Array} materials - List of materials.
     * @returns {Object} Phase totals { R: { watts: 0 }, S: { watts: 0 }, T: { watts: 0 } }
     */
    calculateDirectLoads: function (item, switchboards, materials) {
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
                    if (phaseTotals[channelPhase]) {
                        phaseTotals[channelPhase].watts += totalWattsForLoad;
                    }
                } else if (outlet.type.includes('Monofase')) {
                    if (phaseTotals[outlet.phase]) {
                        phaseTotals[outlet.phase].watts += totalWattsForLoad;
                    }
                } else {
                    // Three-phase load, split across 3 phases
                    phaseTotals.R.watts += totalWattsForLoad / 3;
                    phaseTotals.S.watts += totalWattsForLoad / 3;
                    phaseTotals.T.watts += totalWattsForLoad / 3;
                }
            });
        });
        return phaseTotals;
    },

    /**
     * Calculates the total power load recursively (including children).
     * @param {Object} item - The workspace item.
     * @param {Array} workspaceItems - All items in the workspace.
     * @param {Array} switchboards - List of switchboard templates.
     * @param {Array} materials - List of materials.
     * @returns {Object} Aggregated phase totals.
     */
    calculateRecursiveTotals: function (item, workspaceItems, switchboards, materials) {
        // Calculate direct loads first
        let directLoads = this.calculateDirectLoads(item, switchboards, materials);
        let aggregatedTotals = JSON.parse(JSON.stringify(directLoads));

        // Find children
        const children = workspaceItems.filter(child => child.parentId === item.instanceId);

        children.forEach(child => {
            const childTotals = this.calculateRecursiveTotals(child, workspaceItems, switchboards, materials);

            // Determine how to add child totals to parent
            // We need to know the parent outlet type/phase
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
                // If parent outlet is single phase (Monofase or Socapex channel), 
                // ALL child loads go to that specific phase
                const totalChildWatts = childTotals.R.watts + childTotals.S.watts + childTotals.T.watts;
                aggregatedTotals[parentOutletPhase].watts += totalChildWatts;
            } else {
                // Standard 3-phase to 3-phase connection (or unknown)
                ['R', 'S', 'T'].forEach(phase => {
                    aggregatedTotals[phase].watts += childTotals[phase].watts;
                });
            }
        });
        return aggregatedTotals;
    },

    /**
     * Formats file size in bytes to human readable string.
     * @param {number} bytes 
     * @returns {string}
     */
    formatFileSize: function (bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    },

    /**
     * Converts a File object to Base64 string.
     * @param {File} file 
     * @returns {Promise<string>}
     */
    fileToBase64: function (file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => resolve(reader.result);
            reader.onerror = error => reject(error);
        });
    }
};
