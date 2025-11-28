// src/views/PriorityMatrixView.ts (Updated renderTask method)

import { ItemView, WorkspaceLeaf, Notice, TFile, TAbstractFile, TextComponent, ButtonComponent, Setting,  Modal } from 'obsidian';
import MythicMatrixPlugin from '../main';
import { MATRIX_VIEW_TYPE, QUADRANT_IDS, Task, CompletedTask } from '../constants';
import { FeedbackModal } from '../modals/FeedbackModal';
import { LossLogModal } from '../modals/LossLogModal'; // Import LossLogModal
import { QuickLossLogModal } from 'src/modals/QuickLossLogModal';

interface QuadrantNote {
    file: TFile;
    deadline?: string;
}

export class PriorityMatrixView extends ItemView {
    plugin: MythicMatrixPlugin;
    deadlineInterval: number | null = null;

    private matrixContainer: HTMLElement;
    private crucibleTaskList: HTMLElement;
    private archiveCompletedList: HTMLElement;
    private archiveNoteList: HTMLElement;
    private notesByQuadrant: Record<string, QuadrantNote[]> = {};
    private renderBound = this.render.bind(this);
    private onMetadataChangedBound = this.onMetadataChanged.bind(this);

    constructor(leaf: WorkspaceLeaf, plugin: MythicMatrixPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType() { return MATRIX_VIEW_TYPE; }
    getDisplayText() { return "Mythic Matrix"; }
    getIcon() { return "layout-grid"; }

    async onOpen() {
        this.registerEvent(this.app.metadataCache.on('changed', this.onMetadataChangedBound));
        this.plugin.eventBus.on('settings-updated', this.renderBound);
        this.deadlineInterval = window.setInterval(this.renderBound, 60 * 1000);
        this.render();
    }
    
    async onClose() {
        this.plugin.eventBus.off('settings-updated', this.renderBound);
        if (this.deadlineInterval) clearInterval(this.deadlineInterval);
    }

    private onMetadataChanged(file: TFile) {
        if (file && file.extension === "md") this.render();
    }

    render() {
        this.containerEl.empty();
        this.matrixContainer = this.containerEl.createDiv({ cls: "priority-matrix-container" });
        this.fetchData();
        this.renderMatrixGrid(this.matrixContainer);
        this.renderCrucible(this.matrixContainer);
        this.renderArchive(this.matrixContainer);
    }
    
    private fetchData() {
        const files = this.plugin.app.vault.getMarkdownFiles();
        this.notesByQuadrant = {};
        for (const qid of QUADRANT_IDS) this.notesByQuadrant[qid] = [];
        
        for (const file of files) {
            const fm = this.plugin.app.metadataCache.getFileCache(file)?.frontmatter;
            if (fm && QUADRANT_IDS.includes(fm.priority)) {
                this.notesByQuadrant[fm.priority].push({ file, deadline: fm.deadline });
            }
        }
    }
    
    private renderMatrixGrid(container: HTMLElement) {
        const grid = container.createDiv({ cls: "priority-matrix-grid" });
        const settings = this.plugin.settings;
        for (let i = 0; i < 4; i++) {
            const qid = QUADRANT_IDS[i];
            const quad = grid.createDiv({ cls: "quadrant-container" });
            quad.style.background = settings.quadrantColors[qid];
            quad.createEl("h3", { text: settings.quadrantNames[qid] });
            // --- UPDATE: Setup dropzone for all quadrants, including void ---
            this.setupQuadrantDropzone(quad, qid); // Pass the quadrant ID to the setup function
            // --- END UPDATE ---
            this.renderNotesInQuadrant(quad, this.notesByQuadrant[qid]);
        }
    }

    private renderCrucible(container: HTMLElement) {
        const crucibleWrap = container.createDiv({ cls: "quadrant-container crucible" });
        crucibleWrap.style.background = this.plugin.settings.quadrantColors.crucible;
        crucibleWrap.createEl("h3", { text: this.plugin.settings.quadrantNames.crucible });
        this.setupCrucibleDropzone(crucibleWrap);
        this.setupCrucibleInput(crucibleWrap);
        this.crucibleTaskList = crucibleWrap.createDiv();
        this.renderCrucibleTasks();
    }
  
    private renderArchive(container: HTMLElement) {
        const archiveWrap = container.createDiv({ cls: "quadrant-container archive" });
        archiveWrap.style.background = this.plugin.settings.quadrantColors.archive;
        archiveWrap.createEl("h3", { text: this.plugin.settings.quadrantNames.archive });
        this.setupQuadrantDropzone(archiveWrap, "archive");
        archiveWrap.createEl("h4", { text: "Completed Tasks" });
        this.archiveCompletedList = archiveWrap.createDiv();
        this.renderCompletedTasks();
        archiveWrap.createEl("h4", { text: "Archived Notes" });
        this.archiveNoteList = archiveWrap.createDiv();
        this.renderNotesInQuadrant(this.archiveNoteList, this.notesByQuadrant["archive"]);
    }
  
    private renderNotesInQuadrant(container: HTMLElement, notes: QuadrantNote[]) {
        if (!notes) return;
        for (const note of notes) {
            const noteDiv = container.createDiv({ cls: "quadrant-note-item" });
            noteDiv.createSpan({ text: note.file.basename });
            noteDiv.draggable = true;
            noteDiv.addEventListener('click', () => this.plugin.app.workspace.openLinkText(note.file.path, ''));
            noteDiv.addEventListener('dragstart', ev => {
                if (ev.dataTransfer) ev.dataTransfer.setData('text/plain', note.file.path);
            });
        }
    }

    private setupCrucibleInput(container: HTMLElement) {
        const inputContainer = container.createDiv({ cls: 'crucible-input-container' });
        const textInput = new TextComponent(inputContainer)
            .setPlaceholder("Add new task or drop note here...");
        
        textInput.inputEl.addClass('crucible-input-field');

        const handleAddTask = async () => {
            const text = textInput.getValue().trim();
            if (!text) return;

            const newTask: Task = { id: this.generateTaskId(), text, created: Date.now() };
            this.plugin.settings.tasks.push(newTask);
            await this.plugin.saveSettings();
            
            textInput.setValue("");
            this.renderCrucibleTasks();
        };

        textInput.inputEl.onkeydown = (e) => {
            if (e.key === "Enter") {
                e.preventDefault();
                handleAddTask();
            }
        };

        new ButtonComponent(inputContainer)
            .setButtonText("Add")
            .setCta()
            .onClick(handleAddTask);
    }

    private renderCrucibleTasks() {
        if (!this.crucibleTaskList) return;
        this.crucibleTaskList.empty();
        this.plugin.settings.tasks.forEach((task, index) => {
            this.renderTask(this.crucibleTaskList, task, index);
        });
    }

    private renderTask(container: HTMLElement, task: Task, index: number) {
        const taskDiv = container.createDiv({ cls: "task-item" });
        const checkbox = taskDiv.createEl('input', { type: "checkbox" });

        const taskText = task.text;
        if (taskText.includes("(Loom Type:")) {
        // Extract loom type
        const match = taskText.match(/\(Loom Type:\s*(\w+)\)/i);
        const loomType = match ? match[1] : "Loom";
        
        // Create badge
        const badge = taskDiv.createSpan({
            cls: "loom-task-badge",
            text: `🧵 ${loomType}`
        });
        badge.style.cssText = `
            background: var(--interactive-accent);
            color: white;
            font-size: 0.8em;
            padding: 2px 6px;
            border-radius: 10px;
            margin-left: 8px;
        `;
        }

        checkbox.onchange = () => {
            if (!checkbox.checked) return;
            taskDiv.style.textDecoration = "line-through";
            const modal = new FeedbackModal(this.app, this.plugin, task);
            modal.onClose = () => {
                if (!modal.result) {
                    checkbox.checked = false;
                    taskDiv.style.textDecoration = "none";
                    return;
                }
                this.archiveTask(task, index);
            };
            modal.open();
        };
        taskDiv.createEl("span", { text: task.text });
        
        // --- NEW: Check for #blocked tag and add Labyrinth prompt logic ---
        // This could be a visual indicator or a click handler, or a check on render.
        // For L24, the prompt should happen *when the user interacts* with the blocked task
        // or potentially *when the task is rendered* if it's already blocked.
        // A common interaction might be clicking the task text itself or a specific button.
        // Let's add a click handler on the task text div *if* it contains #blocked.
        // Also, add a visual indicator.
        if (taskText.includes("#blocked")) {
            taskDiv.addClass("task-item-blocked"); // Add a CSS class for styling
            // Example CSS in styles.css:
            // .task-item-blocked { border-left: 3px solid #ff6b6b; opacity: 0.8; }
        }

        // --- NEW: Add Click Handler for #blocked Task Prompt (L24) ---
        // Create the span for the task text and attach the click handler
        const taskTextSpan = taskDiv.createEl("span", { text: taskText });
        taskTextSpan.onclick = (event) => {
            // Check if the task is blocked *at the time of click*
            // This allows for dynamic blocking/unblocking reflected immediately.
            if (task.text.includes("#blocked")) {
                 // Prompt the user
                 const shouldLogBlock = confirm("This task is marked as blocked. Log the obstacle in the Labyrinth?");
                 if (shouldLogBlock) {
                     // Prepare initial context for the log modal
                     // Use the task ID if available, or potentially derive a path if the task links to a note
                     const initialContext = {
                         sourceTask: task.text, // Pre-fill with the task text
                         initialFailureType: "Process Failure" as const, // Likely for blocks
                         // Determine sourceTaskId - this is crucial for L51 if we want to link back precisely.
                         // Pass the Crucible task ID here
                         sourceTaskId: task.id, // Pass the task ID to link back to the Crucible item
                         // initialSyllabusTopics: this.getTopicsFromTask(task.text), // Example helper if needed
                     };

                     // Open the LossLogModal (or QuickLossLogModal) with the context
                     import("../modals/LossLogModal").then((modalModule) => {
                         new modalModule.LossLogModal(
                         this.app,
                         this.plugin.lossLogService, // Use the service instance from the main plugin
                         // Optional: A callback function to execute after successful submission
                         (submittedData) => {
                             console.log("Loss log submitted for blocked task:", submittedData);
                             // The LossLogService will handle tagging the Crucible task list item based on sourceTaskId
                             // via the tagCrucibleTask method implemented previously.
                             // Potentially remove the #blocked tag from the task text here if desired.
                             // this.removeBlockedTagFromTask(task.id); // Example helper
                         },
                         initialContext // Pass the initial context object
                         ).open();
                     }).catch((error) => {
                         console.error("Failed to load LossLogModal:", error);
                         new Notice("Failed to open Labyrinth modal. Please check console.");
                     });
                 }
            }
        };
        // --- END NEW ---

        // --- NEW: Add Labyrinth Button (L61) ---
        // Add the Labyrinth button next to each task
        const labyrinthButton = taskDiv.createEl("button", {
          text: "🧵", // Or use a different emoji like "👁️‍🗨️"
          cls: "labyrinth-btn", // Add a CSS class for styling if needed
          attr: { "aria-label": "Log failure related to this task" } // Accessibility label
        });
        // Use an arrow function to ensure 'this' context is correct
        labyrinthButton.onclick = (event) => {
            event.preventDefault(); // Prevent any default button behavior that might interfere
            this.openLabyrinthModalForTask(task);
        };
        // --- END NEW ---
    }

// --- CONFIRMED METHOD: Open Labyrinth Modal for a specific task (L61) ---
    private openLabyrinthModalForTask(task: Task) {
        console.log(`[PriorityMatrixView] Opening Labyrinth modal for task: ${task.text} (ID: ${task.id})`);

        // Prepare initial context for the modal
        // Crucially, pass the task.id so the LossLogService can tag the correct task in settings.tasks
        const initialContext = {
            sourceTask: task.text, // Pre-fill the source task field
            // Potentially pre-select "Process Failure" as the likely type for a Crucible task
            initialFailureType: "Process Failure" as const, // Use 'as const' for literal type
            // Potentially pre-fill syllabus topics if found in the task text (e.g., [[Topic A]], [[Topic B]])
            // This helps link the failure log back to specific notes if applicable
            initialSyllabusTopics: this.extractTopicsFromTask(task.text), // Example helper
            // --- PASS THE TASK ID (L51) ---
            sourceTaskId: task.id, // Pass the Crucible task ID
            // --- END PASS THE TASK ID ---
            // Potentially add other context like the quadrant it was in, timestamp, etc.
            // initialQuadrant: task.quadrant, // Example if task model had a quadrant field
        };

        // Open the LossLogModal, passing the initial context
        // This assumes LossLogModal constructor accepts initialContext as the last argument
        // and has been updated as shown in previous steps.
        // Adjust the import path if necessary
        import("../modals/LossLogModal").then((modalModule) => {
            new modalModule.LossLogModal(
            this.app,
            this.plugin.lossLogService, // Pass the LossLogService instance
            // Optional: A callback function to execute after successful submission
            (submittedData) => {
                console.log("Loss log submitted successfully from Crucible:", submittedData);
                // The LossLogService will handle tagging the Crucible task list item based on sourceTaskId
                // via the tagCrucibleTask method implemented previously.
                // Could emit an event, update UI, etc.
                // Example: Potentially move the task to 'archive' or another quadrant after logging?
                // this.moveTaskToArchive(task.id); // If desired
            },
            initialContext // Pass the initial context object
            ).open();
        }).catch((error) => {
            console.error("Failed to load LossLogModal:", error);
            new Notice("Failed to open Labyrinth modal. Please check console.");
        });
    }
    // --- END CONFIRMED METHOD ---

// --- NEW HELPER: Extract topics from task text (L51, L85 context) ---
    private extractTopicsFromTask(taskText: string): string[] {
        // Find all [[...]] patterns in the task text
        const topicMatches = taskText.match(/\[\[([^\]]+)\]\]/g) || [];
        // Return the matched strings (e.g., ["[[Topic A]]", "[[Topic B]]"])
        return topicMatches;
    }
    // --- END NEW HELPER ---


    private renderCompletedTasks() {
        if (!this.archiveCompletedList) return;
        this.archiveCompletedList.empty();
        this.plugin.settings.completedTasks.slice(0, 10).forEach(task => {
            const taskDiv = this.archiveCompletedList.createDiv({ cls: "completed-task-item" });
            taskDiv.setText(`✔ ${task.text}`);
        });
    }
  
    private async archiveTask(task: Task, index: number) {
    const settings = this.plugin.settings;
    const completedTask: CompletedTask = { ...task, completed: Date.now() };
    settings.completedTasks.unshift(completedTask);
    settings.tasks.splice(index, 1);
    await this.plugin.saveSettings();

    // --- NEW: L87 Thread Reinforcement Prompt ---
        const match = task.text.match(/\[\[(.*?)\]\]/);
        if (match) {
            const topicName = match[1];
            // Check for thread
            const thread = this.plugin.lossLogService.getThreadForTopic(topicName);
            
            if (thread) {
                this.triggerThreadReinforcement(topicName, thread);
            }
        }
        // -------------------------------------------

    // --- Existing Phoenix Revision Block ---
    if (settings.enableRevision && this.plugin.revisionScheduler) {
        const match = task.text.match(/\[\[(.*?)\]\]/);
        if (match) {
            const noteBasename = match[1];
            const noteFile = this.app.vault.getFiles().find(f => f.basename === noteBasename);
            if (noteFile) {
                new Notice(`Task for "${noteBasename}" completed. Scheduling first revision.`);
                await this.plugin.revisionScheduler.scheduleFirstRevision(noteFile.path);
            }
        }
    }

    // --- ✅ NEW: Weaver’s Loom Detection Block ---
    const loomMatch = task.text.match(/Synthesize .*\(Loom Type:/i);
    if (loomMatch) {
        this.plugin.eventBus.emit('loomTaskCompleted', task.text);
    }

    this.renderCrucibleTasks();
    this.renderCompletedTasks();
}
    
    private generateTaskId(): string { return Date.now().toString(36) + Math.random().toString(36).substr(2, 5); }

    // --- REMOVED LOCAL getDroppedFile FUNCTION ---

    // --- NEW/REFINED: Setup dropzone for all quadrants (including void for L93) ---
    private setupQuadrantDropzone(element: HTMLElement, targetQuadrantId: string) { // Accept the target quadrant ID
        element.addEventListener("dragover", e => {
            e.preventDefault();
            element.addClass('drag-over');
        });
        element.addEventListener("dragleave", () => element.removeClass('drag-over'));
        element.addEventListener("drop", async e => {
            e.preventDefault();
            element.removeClass('drag-over');

            // Use the service
            const file = await this.plugin.dragDropService.getDroppedFile(e.dataTransfer);
            if (!file) {
                new Notice("Could not find the dragged note.", 3000);
                return;
            }

            // --- NEW: L93 Void Justification ---
            if (targetQuadrantId === "void") {
                const reason = await this.promptForVoidReason(file.basename);
                
                if (!reason) return; // User cancelled the drop

                if (reason === "Source Failure") {
                    // Auto-log to Labyrinth via Quick Log
                    new QuickLossLogModal(
                        this.app, 
                        this.plugin.lossLogService,
                        () => {}, // No callback needed
                        {
                            sourceTask: `Voided Note: [[${file.basename}]]`,
                            initialFailureType: "Process Failure",
                            initialArchetype: "source-deficit" // This triggers L53 VOI Task automatically!
                        }
                    ).open();
                }
            }
            // -----------------------------------

            const quadName = this.plugin.settings.quadrantNames[targetQuadrantId];
            new Notice(`Moved ${file.basename} to ${quadName}`);

            await this.app.fileManager.processFrontMatter(file, fm => {
                fm.priority = targetQuadrantId;
            });
        });
    }

 // --- NEW: Helper for L87 ---
    private triggerThreadReinforcement(topic: string, thread: string) {
        // Simple Modal or Confirm? Modal gives better UX for "Yes I did"
        const modal = new Modal(this.app);
        modal.contentEl.createEl("h2", { text: "🧵 Thread Reinforcement" });
        modal.contentEl.createEl("p", { text: `You just finished a task on "${topic}".` });
        
        const quote = modal.contentEl.createEl("blockquote", { text: thread });
        Object.assign(quote.style, { borderLeft: "4px solid gold", paddingLeft: "10px", fontStyle: "italic" });

        modal.contentEl.createEl("h3", { text: "Did you apply this principle?" });

        const btns = modal.contentEl.createDiv();
        Object.assign(btns.style, { display: "flex", gap: "10px", justifyContent: "flex-end" });

        const yesBtn = btns.createEl("button", { text: "Yes, I did!", cls: "mod-cta" });
        yesBtn.onclick = async () => {
            new Notice("🌟 Wisdom Applied! (+20 XP)");
            // Add XP
            this.plugin.settings.labyrinthXP += 20;
            await this.plugin.saveSettings();
            modal.close();
        };

        const noBtn = btns.createEl("button", { text: "Oops, forgot." });
        noBtn.onclick = () => {
            new Notice("Keep it in mind for next time.");
            modal.close();
        };

        modal.open();
    }
       
// --- NEW: Helper Modal for Void Reason ---
    private async promptForVoidReason(noteName: string): Promise<string | null> {
        return new Promise((resolve) => {
            const modal = new Modal(this.app);
            modal.contentEl.createEl("h3", { text: `🌌 Into the Void: ${noteName}` });
            modal.contentEl.createEl("p", { text: "Why are you abandoning this?" });

            const buttonsDiv = modal.contentEl.createDiv();
            buttonsDiv.style.display = "flex";
            buttonsDiv.style.flexDirection = "column";
            buttonsDiv.style.gap = "10px";

            const reasons = [
                { label: "✅ Completed/Irrelevant", val: "Done" },
                { label: "📉 Source Failure (Bad Material)", val: "Source Failure" },
                { label: "⏳ Too Time Consuming", val: "Time" },
                { label: "❌ Just giving up", val: "GiveUp" }
            ];

            reasons.forEach(r => {
                const btn = buttonsDiv.createEl("button", { text: r.label });
                btn.onclick = () => {
                    modal.close();
                    resolve(r.val);
                };
            });

            // Handle close without choice
            modal.onClose = () => {
                // If resolved already, this does nothing. If not, we need to handle cancel.
                // A simple way is treating close as cancel.
            };
        });
    }

    private setupCrucibleDropzone(element: HTMLElement) {
        element.addEventListener("dragover", e => {
             e.preventDefault();
             element.addClass('drag-over');
        });
        element.addEventListener("dragleave", () => element.removeClass('drag-over'));
        element.addEventListener("drop", async e => {
            e.preventDefault();
            element.removeClass('drag-over');
            // Use the service
            const file = await this.plugin.dragDropService.getDroppedFile(e.dataTransfer);
            if (!file) {
                new Notice("Could not find the dragged note.", 3000);
                return;
            }

            const newTask: Task = {
                id: this.generateTaskId(),
                text: `Review [[${file.basename}]]`,
                created: Date.now()
            };
            this.plugin.settings.tasks.push(newTask);
            await this.plugin.saveSettings();
            new Notice(`Created task to review "${file.basename}"`);
            this.renderCrucibleTasks();
        });
    }
}