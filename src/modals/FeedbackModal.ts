// src/modals/FeedbackModal.ts

import { App, Modal, Setting, Notice } from 'obsidian';
import MythicMatrixPlugin from '../main';
import { AlchemistLogData } from '../services/AlchemistService';
import { QuickLossLogModal } from './QuickLossLogModal';

interface Task {
    id: string;
    text: string;
}

export class FeedbackModal extends Modal {
    plugin: MythicMatrixPlugin;
    task: Task;
    
    public result: 'log_now' | 'log_later' | null = null;

    constructor(app: App, plugin: MythicMatrixPlugin, task: Task) {
        super(app);
        this.plugin = plugin;
        this.task = task;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl("h2", { text: "Alchemist's Log 🧪" });
        contentEl.createEl("p", { text: `Task: ${this.task.text}` }).style.opacity = "0.7";

        const btnContainer = contentEl.createDiv();
        btnContainer.style.display = "flex";
        btnContainer.style.gap = "10px";
        btnContainer.style.justifyContent = "flex-end";
        btnContainer.style.marginTop = "20px";

        const laterBtn = btnContainer.createEl("button", { text: "Log Later" });
        laterBtn.onclick = async () => {
            this.result = 'log_later';

 // --- NEW: L85 Check and Counting Logic (Happens BEFORE adding to alchemistPending) ---
            let shouldPromptForLabyrinthL85 = false;
            let currentDeferralCount = 0;

            // Check if this task is a Weaver's Loom task (contains Loom Type)
            if (this.task.text.includes("(Loom Type:")) {
                // Get the current deferral count for this specific task ID
                const taskId = this.task.id;
                currentDeferralCount = this.plugin.settings.loomDeferralCounts[taskId] || 0;
                // --- INCREMENT COUNT FIRST ---
                currentDeferralCount++;
                // Update the count in settings *before* checking the threshold
                this.plugin.settings.loomDeferralCounts[taskId] = currentDeferralCount;
                // --- END INCREMENT ---

                // --- CHECK THRESHOLD AFTER INCREMENTING ---
                // Check if the *incremented* count meets or exceeds the threshold (e.g., 2)
                if (currentDeferralCount >= 2) { // Use the configurable threshold if available: this.plugin.settings.loomDeferralThreshold || 2
                    shouldPromptForLabyrinthL85 = true;
                }
                // --- END CHECK ---

                console.log(`[FeedbackModal] Deferral count for loom task ${taskId} is now ${currentDeferralCount}. Threshold check: ${currentDeferralCount} >= 2.`);
            }
            // --- END NEW ---


            // --- EXISTING: Add to Alchemist Pending Queue (Updated to include original task ID) ---
            // Add the entry to the pending queue in settings, including the original task ID for potential loom count reset
            const deferredEntry: Partial<AlchemistLogData> = {
                taskText: this.task.text,
                timestamp: Date.now(),
                topic: this.getTopicFromTask(this.task.text),
                // --- ADD ORIGINAL TASK ID (for L85 count reset on processing) ---
                originalTaskId: this.task.id, // Store the ID of the task being deferred
                // --- END ADD ---
                // Provide sensible defaults for the deferred log
                log: "",
                understanding: "⏹️",
                confidenceBefore: "⏹️",
                confidenceAfter: "⏹️",
                difficultyCauses: [],
                fixPrinciple: "",
                serendipitySpark: "",
                insight: "",
            };
            // --- END EXISTING ---

            this.plugin.settings.alchemistPending.push(deferredEntry);
            await this.plugin.saveSettings();

            // --- NEW: Handle L85 Prompt (Based on incremented count) ---
            if (shouldPromptForLabyrinthL85) {
                const shouldLogToLabyrinthL85 = confirm(`This Weaver's Loom task has now been deferred ${currentDeferralCount} times. Log the obstacle in the Labyrinth?`);
                if (shouldLogToLabyrinthL85) {
                    this.close(); // Close this modal first

                    // Prepare initial context for the quick log modal, focusing on the loom task and deferral context
                    const initialContext = {
                        sourceTask: this.task.text, // Pre-fill the source task text
                        initialFailureType: "Process Failure" as const, // Likely for repeated deferrals
                        initialArchetypes: ["process-failure"], // Default archetype for deferral
                        // Determine sourceTaskId for potential auto-tagging (L51)
                        // Try to extract a note path from the task text (e.g., [[Note Name]])
                        sourceTaskId: this.extractSourceNotePath(this.task.text), // Helper function to find linked note
                    };

                    // Open the QuickLossLogModal with the context
                    new QuickLossLogModal(
                        this.app,
                        this.plugin.lossLogService, // Assuming lossLogService is available on main plugin
                        (submittedData) => {
                            console.log("Labyrinth quick log (L85) submitted via FeedbackModal loom deferral prompt:", submittedData);
                            new Notice("Labyrinth: Loom obstacle logged.");
                        },
                        initialContext // Pass the initial context object (4th argument)
                    ).open();
                    return; // Exit after opening the log modal to prevent further closing logic (and saving settings again here)
                }
            }
            // --- END NEW ---

            // --- EXISTING: Check for #blocked tag on Deferral (L24) ---
            // This check happens *after* the L85 check and *after* the count is incremented and potentially acted upon.
            // It also happens *after* the task is added to the alchemist queue.
            // This means if a task is both blocked and deferred twice, the user sees the L85 prompt first if they decline it, *then* the L24 prompt.
            // If the user confirms the L85 prompt, the modal closes and the L24 prompt is skipped.
            if (this.task.text.includes("#blocked")) {
                 const shouldLogBlockToLabyrinth = confirm("This task is marked as blocked. Log the obstacle in the Labyrinth?");
                 if (shouldLogBlockToLabyrinth) {
                     this.close(); // Close this modal first

                     // Prepare initial context for the quick log modal, prioritizing blocked task context
                     const initialContext = {
                         sourceTask: this.task.text, // Pre-fill the source task text
                         initialFailureType: "Process Failure" as const, // Likely for blocks
                         initialArchetypes: ["process-failure"], // Default archetype for blockage
                         // Determine sourceTaskId for potential auto-tagging (L51)
                         // Try to extract a note path from the task text (e.g., [[Note Name]])
                         sourceTaskId: this.extractSourceNotePath(this.task.text), // Helper function to find linked note
                     };

                     // Open the QuickLossLogModal with the context
                     new QuickLossLogModal(
                     this.app,
                     this.plugin.lossLogService, // Assuming lossLogService is available on main plugin
                     (submittedData) => {
                         console.log("Labyrinth quick log (L24) submitted via FeedbackModal blocked task prompt:", submittedData);
                         new Notice("Labyrinth: Block obstacle logged.");
                     },
                     initialContext // Pass the initial context object (4th argument)
                     ).open();
                     return; // Exit after opening the log modal to prevent further closing logic
                 }
            }
            // --- END EXISTING ---

            await this.plugin.saveSettings(); // Save settings after potentially updating deferral counts and handling prompts
            new Notice("Reflection deferred to Alchemist's Log");
            this.close(); // Close the feedback modal after deferring (unless labyrinth modal was opened)
        };

        const nowBtn = btnContainer.createEl("button", { text: "Log Now", cls: "mod-cta" });
        nowBtn.onclick = () => {
            this.result = 'log_now';

            // --- NEW: Reset Loom Deferral Count on Completion (L85) ---
            // Check if the task being completed is a Weaver's Loom task and reset its count
            if (this.task.text.includes("(Loom Type:")) {
                console.log(`[FeedbackModal] Loom task ${this.task.id} is being completed (Log Now clicked). Resetting deferral count (L85).`);
                // Access the service via the main plugin instance to reset the count
                this.plugin.lossLogService.resetLoomDeferralCount(this.task.id); // Use plugin.lossLogService and the task's ID
                // Save settings after resetting the count
                this.plugin.saveSettings().catch((e) =>
                    console.error("[FeedbackModal] Error saving settings after resetting loom deferral count:", e)
                );
            }
            // --- END NEW ---

            // Open the full Alchemist Log Modal for immediate logging
            this.plugin.openAlchemistLogModal({
                taskText: this.task.text,
                topic: this.getTopicFromTask(this.task.text),
                timestamp: Date.now()
            });
            this.close();
        };
    }

    /**
     * Helper method to open the QuickLossLogModal with pre-filled context.
     * @param failureType The initial failure type to set.
     * @param archetypes The initial failure archetypes to set.
     */
    private openLabyrinthQuickLog(failureType: string, archetypes: string[]) {
        this.close(); // Close this modal first

        // --- FIXED: Create the initialContext object without duplicate properties ---
        const initialContext = {
            sourceTask: this.task.text,
            initialFailureType: failureType as any, // Use 'as any' or a proper type union if needed
            initialArchetypes: archetypes,
            // Prefer a linked note path for tagging, but fall back to the Crucible task ID.
            sourceTaskId: this.extractSourceNotePath(this.task.text) || this.task.id,
        };

        new QuickLossLogModal(
            this.app,
            this.plugin.lossLogService,
            (submittedData) => {
                console.log("Labyrinth quick log submitted via FeedbackModal prompt:", submittedData);
                new Notice("Labyrinth: Obstacle logged.");
            },
            initialContext
        ).open();
    }

    private getTopicFromTask(taskText: string): string {
        const match = taskText.match(/\[\[(.*?)\]\]/);
        return match ? match[1] : "General";
    }

    /**
     * Helper to extract a source note path from task text.
     * Looks for the first [[Note Name]] pattern and returns its full path if the file exists.
     */
    private extractSourceNotePath(taskText: string): string | undefined {
        const match = taskText.match(/\[\[([^\]]+)\]\]/);
        if (match) {
            const noteBasename = match[1];
            const noteFile = this.app.vault.getFiles().find(f => f.basename === noteBasename);
            return noteFile ? noteFile.path : undefined;
        }
        return undefined;
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}