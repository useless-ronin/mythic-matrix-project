// src/main.ts

import { Plugin, Notice, TFile } from 'obsidian'; // ← ADD Notice and TFile
import { EventBus } from './services/EventBus';
import { ArchiveHistoryService } from './services/ArchiveHistoryService';
import { RevisionScheduler } from './services/RevisionScheduler';
import { AlchemistService } from './services/AlchemistService';
import { DEFAULT_SETTINGS, MythicMatrixSettings, PHOENIX_VIEW_TYPE, MYTHOS_HUB_VIEW_TYPE, ALCHEMIST_LOG_VIEW_TYPE, MATRIX_VIEW_TYPE } from './constants';
import { AlchemistLogModal } from './modals/AlchemistLogModal';
import { PhoenixNestView } from './views/PhoenixNestView';
import { MythosHubView } from './views/MythosHubView';
import { AlchemistLogView } from './views/AlchemistLogView';
import { PriorityMatrixView } from './views/PriorityMatrixView';
import { MythicMatrixSettingTab } from './settings/MythicMatrixSettingTab';
import { DragDropService } from './services/DragDropService';
import { SynthesisService } from './services/SynthesisService';
import { WeaverLoomView, WEAVER_LOOM_VIEW_TYPE } from './views/WeaverLoomView';
import { registerCommands } from './commands'; // ← NEW IMPORT
import { WeaverLoomModal } from './modals/WeaverLoomModal';
import { LossLogService } from './services/LossLogService'; // Import the service
import { LossLogModal } from './modals/LossLogModal'; // Import the modal if needed elsewhere
import { LabyrinthView, LABYRINTH_VIEW_TYPE } from './views/LabyrinthView'; // Adjust path if needed
import { RitualService } from './services/RitualService'; // Import



export default class MythicMatrixPlugin extends Plugin {
  settings: MythicMatrixSettings;
  eventBus: EventBus;
  archiveService: ArchiveHistoryService;
  revisionScheduler: RevisionScheduler;
  alchemistService: AlchemistService;
  dragDropService: DragDropService; 
  synthesisService: SynthesisService;
  lossLogService: LossLogService; // Add the new service property
  ritualService: RitualService;


  async onload() {
    console.log('Loading Mythic Matrix Plugin...');
    await this.loadSettings();

    // Initialize services
    this.eventBus = new EventBus();
    this.dragDropService = new DragDropService(this.app);
    this.archiveService = new ArchiveHistoryService(this.eventBus);
    this.alchemistService = new AlchemistService(this.app, this, this.lossLogService);
    this.synthesisService = new SynthesisService(this.app, this.eventBus, this.settings, this);
    this.lossLogService = new LossLogService(this.app, this.eventBus, this.settings, this, this.revisionScheduler); // Ensure scheduler passed if needed
    this.ritualService = new RitualService(this.app, this, this.lossLogService);

    if (this.settings.enableRevision) {
      this.revisionScheduler = new RevisionScheduler(this.app, this.eventBus, this.settings);
    }

    // Listen to metadata changes for potential answer rubric scoring checks (L94)
    // This event fires when frontmatter or embedded links change
    this.registerEvent(
      this.app.metadataCache.on("changed", (file) => {
        if (file.extension === "md") {
            // Check if this file is an answer rubric note based on path or frontmatter tag
            // Example: Check if it's in a specific folder
            if (file.path.startsWith(this.settings.answerRubricFolder || "60 Answers/")) {
                this.checkAnswerRubricScoring(file);
            }
            // OR, check if it has a specific tag in its frontmatter
            // const cache = this.app.metadataCache.getFileCache(file);
            // if (cache?.frontmatter?.tags?.includes("answer-rubric")) {
            //     this.checkAnswerRubricScoring(file);
            // }
        }
      })
    );

    // Register views
    this.registerView(PHOENIX_VIEW_TYPE, (leaf) => new PhoenixNestView(leaf, this));
    this.registerView(MYTHOS_HUB_VIEW_TYPE, (leaf) => new MythosHubView(leaf, this));
    this.registerView(ALCHEMIST_LOG_VIEW_TYPE, (leaf) => new AlchemistLogView(leaf, this));
    this.registerView(MATRIX_VIEW_TYPE, (leaf) => new PriorityMatrixView(leaf, this));
    this.registerView(WEAVER_LOOM_VIEW_TYPE, (leaf) => new WeaverLoomView(leaf, this));
    import('./views/LabyrinthView').then(({ LabyrinthView, LABYRINTH_VIEW_TYPE }) => {
    this.registerView(LABYRINTH_VIEW_TYPE, (leaf) => new LabyrinthView(leaf, this.lossLogService));
  }).catch(console.error);  

    // Add settings tab
    this.addSettingTab(new MythicMatrixSettingTab(this.app, this));

    // 🔥 REGISTER ALL COMMANDS HERE
    registerCommands(this);

    // RE-REGISTER the event listener to include the new handler
       this.eventBus.on('weeklyReset', this.handleWeeklyReset.bind(this));

    console.log('Mythic Matrix Plugin loaded.');
  }

  onunload() {
    console.log('Unloading Mythic Matrix Plugin...');
    this.app.workspace.detachLeavesOfType(PHOENIX_VIEW_TYPE);
    this.app.workspace.detachLeavesOfType(MYTHOS_HUB_VIEW_TYPE);
    this.app.workspace.detachLeavesOfType(ALCHEMIST_LOG_VIEW_TYPE);
    this.app.workspace.detachLeavesOfType(MATRIX_VIEW_TYPE);
    this.app.workspace.detachLeavesOfType(WEAVER_LOOM_VIEW_TYPE);
    this.app.workspace.detachLeavesOfType(LABYRINTH_VIEW_TYPE);
    this.eventBus.off('weeklyReset', this.handleWeeklyReset.bind(this)); // Assuming eventBus is used


  }

  // --- Helper Methods (kept minimal) ---

  rerenderMatrixView = () => {
    const leaves = this.app.workspace.getLeavesOfType(MATRIX_VIEW_TYPE);
    leaves.forEach(leaf => {
      if (leaf.view instanceof PriorityMatrixView) leaf.view.render();
    });
  }

  openAlchemistLogModal(context: any) {
    const onSave = async () => {
      if (context.timestamp) {
        this.settings.alchemistPending = this.settings.alchemistPending.filter(p => p.timestamp !== context.timestamp);
        await this.saveSettings();
      }
      this.eventBus.emit('alchemist:log-updated');
    };
    new AlchemistLogModal(this.app, this.alchemistService, { ...context, onSave }).open();
  }

  async activateView(viewType: string) {
    this.app.workspace.detachLeavesOfType(viewType);
    const leaf = this.app.workspace.getLeaf("tab");
    if (leaf) {
      await leaf.setViewState({ type: viewType, active: true });
      this.app.workspace.revealLeaf(leaf);
    } else {
      const errorMsg = `Error: Could not open the ${viewType} view.`;
      new Notice(errorMsg);
      console.error(`Mythic Matrix: ${errorMsg}`);
    }
  }

  // --- All command logic moved to commands.ts ---
  // The following methods are ONLY called by commands.ts

  async createAnswerFromLoom(loomFile: TFile) {
    try {
      const tp = (this.app as any).plugins?.plugins?.['templater-obsidian']?.templater?.current_functions_object;
      if (!tp) {
        new Notice("Templater plugin is not active.", 5000);
        return;
      }
      const templateFile = tp.file.find_tfile("Answer from Loom Template");
      if (!templateFile) {
        new Notice("Template 'Answer from Loom Template.md' not found.", 5000);
        return;
      }
      const newFileName = `Mains Answer for ${loomFile.basename.replace('.md', '')}`;
      const newFile = await tp.file.create_new(templateFile, newFileName, false);
      if (newFile) {
        await this.app.fileManager.processFrontMatter(newFile, fm => {
          fm.sourceLoom = `[[${loomFile.basename}]]`;
          fm.loomPath = loomFile.path;
        });
      }
    } catch (e) {
      console.error("Loom-to-Answer error:", e);
      new Notice("Failed to create answer draft.", 5000);
    }
  }

  // src/main.ts → handleSourceNoteRevised
  private async handleSourceNoteRevised(file: TFile) {
    // Only proceed if synthesis is enabled
    if (!this.settings.enableSynthesis) return;

    const basename = file.basename;
    const loomFiles = this.app.vault.getMarkdownFiles().filter(f =>
      f.path.startsWith(this.settings.synthesisNoteFolder || "50 Synthesis")
    );

    for (const loomFile of loomFiles) {
      const cache = this.app.metadataCache.getFileCache(loomFile);
      if (!cache?.frontmatter) continue; // 🔥 FIXED NULL CHECK

      const topics = cache.frontmatter.loomTopics as string[] | undefined;
      if (!topics) continue;

      const topicBasenames = topics.map(t => t.replace(/\[\[|\]\]/g, ''));
      if (topicBasenames.includes(basename)) {
        // Re-open loom modal for re-weaving
        const loomDetails = {
          loomType: cache.frontmatter.loomType as string,
          topics: topicBasenames,
          originalTask: `Re-weave synthesis for [[${basename}]]`,
          aura: cache.frontmatter.provenance?.aura as string | undefined
        };

        // 🔥 PASS PLUGIN INSTANCE (not bare 'this')
        new WeaverLoomModal(
          this.app,
          loomDetails,
          this.synthesisService,
          this // ← plugin instance
        ).open();
      }
    }
  }



  async upgradeLoomToConstellation(file: TFile) {
    const cache = this.app.metadataCache.getFileCache(file);
    if (cache?.frontmatter?.loomType !== "triad") {
      new Notice("Only Triad looms can be upgraded.");
      return;
    }
    // Reopen modal with same topics + Constellation type
    const topics = cache.frontmatter.loomTopics as string[];
    const taskText = `Map ${topics.join(', ')} across GS1-GS4 (Loom Type: Constellation)`;
    new WeaverLoomModal(this.app, 
      { loomType: "constellation", topics: topics.map(t => t.replace(/\[\[|\]\]/g, '')), originalTask: taskText, aura: undefined },
      this.synthesisService,
      this
    ).open();
  }

  public generateReverseLoomTask(file: TFile) {
    const basename = file.basename;
    const taskText = `Map [[${basename}]] across GS1, GS2, GS3, GS4 (Loom Type: Constellation)`;
    this.settings.tasks.push({ id: Date.now().toString(36), text: taskText, created: Date.now() });
    this.saveSettings();
    new Notice(`Reverse loom task created for ${basename}`);
  }

// --- MODIFIED: Handle the weekly reset event ---
    private async handleWeeklyReset(): Promise<void> {
        console.log("[MythicMatrixPlugin] ⏳ Initiating Weekly Ritual...");
        
        // 1. Generate the Time Capsule (Save the state before wiping)
        try {
            await this.ritualService.generateTimeCapsule();
        } catch (e) {
            console.error("Failed to generate Time Capsule:", e);
            new Notice("Error generating Time Capsule. Check console.");
        }

        // 2. Trigger Subsystem Resets (Destructive actions)
        console.log("[MythicMatrixPlugin] Resetting subsystems...");
        this.lossLogService.handleWeeklyReset(); 
        
        // Optional: Archive completed tasks from settings to prevent bloat?
        this.archiveCompletedTasks(); 

        new Notice("Weekly Ritual Complete. The slate is clean.");
    }

private async archiveCompletedTasks() {
        // Keep only the last 10 completed tasks for the UI list, archive the rest
        // Since we already saved them to the Time Capsule note, we can drop them from memory.
        if (this.settings.completedTasks.length > 10) {
            this.settings.completedTasks = this.settings.completedTasks.slice(0, 10);
            await this.saveSettings();
            console.log("[MythicMatrixPlugin] Archived old completed tasks from settings.");
        }
    }    

  // --- NEW: Method to check answer rubric scoring (L94) ---
  private async checkAnswerRubricScoring(file: TFile) {
    console.log(`[MythicMatrixPlugin] Checking answer rubric scoring for: ${file.path} (L94)`);

    try {
      const cache = this.app.metadataCache.getFileCache(file);
      if (cache && cache.frontmatter) {
        const structureScore = cache.frontmatter.structure as number;
        const clarityScore = cache.frontmatter.clarity as number;

        // Define the low score threshold (e.g., <= 2)
        const lowScoreThreshold = 2;

        let failedAspect = ""; // Store which aspect failed

        if (typeof structureScore === 'number' && structureScore <= lowScoreThreshold) {
            failedAspect = "Structure";
        } else if (typeof clarityScore === 'number' && clarityScore <= lowScoreThreshold) {
            failedAspect = "Clarity";
        }

        // If either Structure or Clarity is low, prompt the user
        if (failedAspect) {
            const shouldLogToLabyrinth = confirm(`This answer's ${failedAspect.toLowerCase()} scored low (${failedAspect}: ${structureScore ?? clarityScore}). Log the structural/clarity issue in the Labyrinth?`);
            if (shouldLogToLabyrinth) {
                // Prepare initial context for the log modal, focusing on the failed aspect
                const initialContext = {
                    sourceTask: `[[${file.basename}]]`, // Pre-fill with the answer note link as the source task
                    initialFailureType: "Process Failure" as const, // Likely for structure/clarity issues
                    initialArchetypes: [`structure-failure`, `clarity-failure`].filter(a => a.includes(failedAspect.toLowerCase())), // Pre-fill relevant archetype based on the failed aspect
                    // Determine sourceTaskId for potential auto-tagging (L51)
                    // The file path is the source here
                    sourceTaskId: file.path,
                };

                // Open the LossLogModal (or QuickLossLogModal) with the context
                // Using LossLogModal for potentially more detailed reflection on structure/clarity
                new LossLogModal(
                    this.app,
                    this.lossLogService, // Use the lossLogService instance from the main plugin
                    // Optional: A callback function to execute after successful submission
                    (submittedData) => {
                        console.log(`Labyrinth log (L94 - ${failedAspect}) submitted via answer rubric scoring check for note:`, file.path, submittedData);
                        new Notice(`Labyrinth: ${failedAspect} failure logged for ${file.basename}.`);
                    },
                    initialContext // Pass the initial context object
                ).open();
            }
        } else {
            console.log(`[MythicMatrixPlugin] Answer rubric ${file.path} scores are adequate. No prompt for L94.`);
        }
      } else {
        console.log(`[MythicMatrixPlugin] File ${file.path} does not have frontmatter or cache not available. Skipping L94 check.`);
      }
    } catch (e) {
      console.error(`[MythicMatrixPlugin] Error checking answer rubric scoring for ${file.path} (L94):`, e);
      // Optionally show a notice to the user
      // new Notice(`Failed to check answer rubric scoring for ${file.basename}. Check console.`);
    }
  }
  // --- END NEW ---
  

  // --- Data Persistence ---

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
    // Notify services of the update
    this.alchemistService.updateSettings(this.settings);
    this.synthesisService.updateSettings(this.settings);
    // --- Notify LossLogService ---
    this.lossLogService.updateSettings(this.settings);
    // --- End Notify LossLogService ---
    // Notify other services as needed if they have updateSettings method
    if (this.revisionScheduler) {
      this.revisionScheduler.updateSettings(this.settings);
    }
    // Archive service might not need settings update if it only uses eventBus
  }
}