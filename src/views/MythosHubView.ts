// src/views/MythosHubView.ts

import { ItemView, WorkspaceLeaf, Notice } from 'obsidian';
import MythicMatrixPlugin from '../main';
import { MYTHOS_HUB_VIEW_TYPE } from '../constants';
import { LossLogDeferredModal } from '../modals/LossLogDeferredModal'; // Import the deferred modal
import { QuickLossLogModal } from '../modals/QuickLossLogModal'; // Import the new modal


export class MythosHubView extends ItemView {
    plugin: MythicMatrixPlugin;

    constructor(leaf: WorkspaceLeaf, plugin: MythicMatrixPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType() {
        return MYTHOS_HUB_VIEW_TYPE;
    }

    getDisplayText() {
        return "Mythos Hub";
    }

    getIcon() {
        return "infinity";
    }

    async onOpen() {
        // 🔥 LISTEN FOR PENDING UPDATES (Keep existing)
        this.plugin.eventBus.on('weaver:pending-updated', () => this.renderHub());
        // Add listener for Labyrinth pending updates if your LossLogService emits them
        // Example: this.plugin.eventBus.on('labyrinth:pending-updated', () => this.renderHub());
        this.renderHub();
    }

    async onClose() {
        // 🔥 UNLISTEN TO PREVENT MEMORY LEAKS (Keep existing)
        this.plugin.eventBus.off('weaver:pending-updated', () => this.renderHub());
        // Example: this.plugin.eventBus.off('labyrinth:pending-updated', () => this.renderHub());
    }

    async renderHub() {
        this.containerEl.empty();
        const title = this.containerEl.createEl("h2", { text: "The Mythos Hub \u{1F300}" });
        title.style.textAlign = "center";
        title.style.marginBottom = "20px";



        // 🔥 EXISTING SUBSYSTEMS (Keep as is)
        const subsystems = [
            { id: "phoenix", name: "Phoenix Nest", icon: "\u{1F54A}\uFE0F", description: "Spaced repetition revisions" },
            { id: "alchemist", name: "Alchemist's Log", icon: "\u{1F9EA}", queueKey: "alchemistPending", description: "Deferred reflections" },
            { id: "weaver", name: "Weaver's Loom", icon: "\u{1F9F6}", queueKey: "weaverPending", description: "Deferred synthesis tasks" }
        ];

        for (const sys of subsystems) {
            const card = this.containerEl.createEl("div", { cls: "mythos-hub-card" });
            const header = card.createEl("div", { cls: "mythos-hub-card-header" });
            header.createEl("h3", { text: `${sys.icon} ${sys.name}` });

            // 🔥 SHOW PENDING COUNT FOR ALL QUEUES (Keep as is)
            if (sys.queueKey) {
                const queue = this.plugin.settings[sys.queueKey as keyof typeof this.plugin.settings] || [];
                if (Array.isArray(queue) && queue.length > 0) {
                    header.createEl("span", { text: `${queue.length}`, cls: "mythos-hub-card-pending-count" });
                }
            }

            card.createEl("div", { text: sys.description, cls: "mythos-hub-card-desc" });
            const btn = card.createEl("button", { text: `Enter ${sys.name.split(" ")[0]}` });
            btn.style.marginTop = "12px";
            btn.onclick = async () => {
                if (sys.id === "phoenix") {
                    await this.plugin.activateView("phoenix-nest-view");
                } else if (sys.id === "alchemist") {
                    await this.plugin.activateView("alchemist-log-view");
                } else if (sys.id === "weaver") {
                    // 🔥 PROCESS NEXT PENDING LOOM (Keep as is)
                    this.plugin.synthesisService.processNextPendingLoom();
                }
            };
        }

        // --- NEW SECTION: Labyrinth of Loss ---
        // Create the card structure similar to existing cards
        const labyrinthCard = this.containerEl.createEl("div", { cls: "mythos-hub-card" });
        const labyrinthHeader = labyrinthCard.createEl("div", { cls: "mythos-hub-card-header" });
        labyrinthHeader.createEl("h3", { text: `\u{1F5FF} Labyrinth of Loss` }); // Labyrinth icon

        // 🔥 SHOW PENDING COUNT FOR LABYRINTH QUEUE
        const labyrinthQueue = this.plugin.settings.lossLogPending || []; // Access the settings array
        if (Array.isArray(labyrinthQueue) && labyrinthQueue.length > 0) {
            labyrinthHeader.createEl("span", { text: `${labyrinthQueue.length}`, cls: "mythos-hub-card-pending-count" });
        }

        labyrinthCard.createEl("div", { text: "Deferred failure logs", cls: "mythos-hub-card-desc" });

        // Button to process the *next* pending log (FIFO)
        const processBtn = labyrinthCard.createEl("button", { text: `Process Next` });
        processBtn.style.marginTop = "12px";
        processBtn.onclick = () => {
            if (labyrinthQueue.length > 0) {
                // Get the first item from the queue (FIFO)
                const pendingItem = labyrinthQueue[0];
                // CRITICAL: Determine the *correct* index of this item in the settings array.
                // Using the index of the *first* matching item is correct if the queue is treated as FIFO
                // and items are only removed from the front or at the specific index processed.
                // If items could be removed from the middle by other means (e.g., a "remove" button on a specific item in the list),
                // this logic would need to be more sophisticated, perhaps storing unique IDs.
                // For now, assuming FIFO queue behavior driven by 'Process Next' or the deferred modal's removal.
                const indexInSettingsArray = this.plugin.settings.lossLogPending.indexOf(pendingItem);

                if (indexInSettingsArray !== -1) {
                    this.openLabyrinthDeferredModal(pendingItem, indexInSettingsArray);
                } else {
                    // This case should ideally not happen if the item was just fetched from the array.
                    // It might indicate a race condition or unexpected modification of the array.
                    console.error("[MythosHubView] Could not find the correct index for the pending Labyrinth item using indexOf.");
                    new Notice("Error processing Labyrinth item (index not found). Please refresh the hub.");
                    this.renderHub(); // Re-render as a fallback to show current state
                }
            } else {
                new Notice("No pending failure logs to process.");
            }
        };

        // Button to open the dedicated Labyrinth view
        const viewBtn = labyrinthCard.createEl("button", { text: `Open Labyrinth View` });
        viewBtn.style.marginTop = "8px"; // Add some spacing
        viewBtn.onclick = async () => {
            await this.plugin.activateView('labyrinth-view');
        };
        // --- END NEW SECTION ---

         // --- Action Buttons Section (Updated) ---
    const actionsSection = this.contentEl.createDiv({ cls: "mythos-hub-actions-section" });
    actionsSection.createEl("h3", { text: "Actions" });

    // Button to open the Quick Log modal
    actionsSection.createEl("button", {
      text: "Quick Log Failure (Labyrinth)",
      cls: "quick-log-failure-btn", // Add a specific class for styling if needed
    }).addEventListener("click", () => {
        // Check if Labyrinth is enabled before opening the quick log
        if (this.plugin.settings.enableLabyrinth) {
            new QuickLossLogModal(
                this.app,
                this.plugin.lossLogService,
                (submittedData) => {
                    console.log("Quick loss log submitted successfully from Mythos Hub:", submittedData);
                    // The quick log modal saves immediately, so no specific hub refresh is needed here
                    // unless you track quick logs separately in the hub stats.
                }
            ).open();
        } else {
            new Notice("Labyrinth of Loss is not enabled.");
        }
    });
    
    }

    // --- NEW METHOD: Open Deferred Modal for Labyrinth ---
    private openLabyrinthDeferredModal(pendingItem: any, index: number) { // Using 'any' if PendingLossLog interface isn't directly accessible, refine if needed
        // The LossLogDeferredModal expects the service instance
        // Access the service from the main plugin instance
        const lossLogService = this.plugin.lossLogService;

        new LossLogDeferredModal(
            this.app,
            lossLogService, // Pass the service instance
            pendingItem, // Pass the specific pending item data
            index, // Pass its index for removal
            () => {
                // Callback function passed to the modal
                // When the modal closes after processing (either logging or removing),
                // it should call this callback to notify the hub view to re-render
                console.log("[MythosHubView] Labyrinth deferred modal closed, refreshing hub.");
                this.renderHub(); // Re-render the hub view to update the pending count
            }
        ).open();
    }
    // --- END NEW METHOD ---
}