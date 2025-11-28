// src/modals/LossLogModal.ts

import { App, Modal, Setting, TextAreaComponent, Notice } from "obsidian";
import { LossLogService, PendingLossLogContext } from "../services/LossLogService";
import { 
    LossLogData, 
    FailureType, 
    DEFAULT_FAILURE_ARCHETYPES,
    EXAM_PHASES,      // <--- ADDED
    QUESTION_TYPES,   // <--- ADDED
    SOURCE_TYPES      // <--- ADDED
} from "../constants";
import MythicMatrixPlugin from "../main"; // Import Plugin class


// Define the initial context structure for the main loss log modal
interface InitialLossLogContext {
  sourceTask?: string;
  initialFailureType?: FailureType;
  initialArchetypes?: string[];
  initialAura?: string;
  initialSyllabusTopics?: string[]; 
  sourceTaskId?: string; 
  isProactiveMode?: boolean; 
}

// --- NEW: Define Thread Templates (L72) ---
const THREAD_TEMPLATES: Record<string, string> = {
  "conceptual-error": "Always cross-check fundamental concepts with the primary source (e.g., Laxmikanth, NCERT) before answering.",
  "time-mismanagement": "Always set a strict time limit for each section of the task and use a timer.",
  "source-deficit": "Always verify the credibility and depth of source material before synthesizing.",
  "silly-mistake": "Always review the final answer/check calculations before submitting.",
  "faded-knowledge": "Schedule a focused revision session on this topic within 24 hours.",
};

// --- NEW: Define Keyword Suggestions (L71) ---
const KEYWORD_SUGGESTIONS: Record<string, string[]> = {
  "second-guessed": ["overthinking"],
  "doubt": ["overthinking"],
  "forgot": ["faded-knowledge", "source-deficit"],
  "confused": ["conceptual-error"],
  "time": ["time-mismanagement"],
  "ran-out": ["time-mismanagement"],
  "source": ["source-deficit"],
  "credibility": ["source-deficit"],
  "procrastinated": ["process-failure"],
  "distracted": ["process-failure"],
  "tired": ["process-failure"],
};

export class LossLogModal extends Modal {
  private lossLogService: LossLogService;
  private onSubmit: ( data:LossLogData) => void;
  private initialContext?: InitialLossLogContext;
  private plugin: MythicMatrixPlugin; // Need access to plugin to open Alchemist Modal


  // State variables to hold user input
  private sourceTask: string = "";
  private failureType: FailureType | null = null;
  private selectedArchetypes: string[] = [];
  private impact: number = 1;
  private syllabusTopics: string = "";
  private syllabusPapers: string = "";
  private aura: string = "#aura-mid";
  private emotionalState: string = "";
  private rootCauseChain: string[] = [""];
  private ariadnesThread: string = "";
  private counterFactual: string = "";
  private evidenceLink: string = "";
  private linkedMockTest: string = "";
  private failureRealizationPoint: string = "";
  private isProactiveMode: boolean = false;


  // --- NEW CONTEXT FIELDS ---
  private confidenceScore: number = 3;
  private questionType: string = "";
  private sourceType: string = "";
  private examPhase: string = "";

    constructor(app: App, lossLogService: LossLogService, onSubmit: (data: LossLogData) => void, initialContext?: InitialLossLogContext) {
        super(app);
        this.lossLogService = lossLogService;
        // Hacky way to get plugin if not passed directly, but better to pass it.
        // Assuming lossLogService has a public 'plugin' property now (if we made it public earlier).
        // If not, we cast.
        this.plugin = (this.lossLogService as any).plugin; 
        
        this.onSubmit = onSubmit;
        this.initialContext = initialContext;

    if (this.initialContext?.sourceTask) {
      this.sourceTask = this.initialContext.sourceTask;
    }
    if (this.initialContext?.initialFailureType) {
      this.failureType = this.initialContext.initialFailureType;
    }
    if (this.initialContext?.initialArchetypes) {
      this.selectedArchetypes = [...this.initialContext.initialArchetypes]; 
    }
    if (this.initialContext?.initialAura) {
      this.aura = this.initialContext.initialAura;
    }
    if (this.initialContext?.initialSyllabusTopics) {
      this.syllabusTopics = this.initialContext.initialSyllabusTopics.join(", "); 
    }
    this.isProactiveMode = this.initialContext?.isProactiveMode || false;

    // --- NEW: L23 Pre-fill Mock Test ---
    if (!this.linkedMockTest) {
        const detectedMock = this.lossLogService.getRecentMockTest ? this.lossLogService.getRecentMockTest() : undefined;
        if (detectedMock) {
            this.linkedMockTest = detectedMock;
        }
    }
  }

  private updateArchetypeDisplay() {
    const archetypeDisplay = this.containerEl.querySelector('.selected-archetypes-display');
    if (archetypeDisplay) {
      archetypeDisplay.textContent = `Selected: ${this.selectedArchetypes.join(", ") || "None"}`;
    }
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("loss-log-modal");

    if (this.isProactiveMode) {
      contentEl.createEl("h2", { text: "Scrying Pool: Log Future Risk" });
      contentEl.createEl("p", { text: "Describe a potential obstacle or risk you anticipate.", cls: "modal-subtitle" });
    } else {
      contentEl.createEl("h2", { text: "Enter the Labyrinth" });
      contentEl.createEl("p", { text: "Log a failure that has already occurred.", cls: "modal-subtitle" });
    }

    // --- 1. Failure Triage ---
    new Setting(contentEl)
      .setName(this.isProactiveMode ? "1. Anticipated Failure Type" : "1. Failure Type")
      .setDesc(this.isProactiveMode ? "What type of potential failure are you anticipating?" : "What type of failure was this?")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("", "Select...")
          .addOption("Knowledge Gap", "Knowledge Gap (Didn't know)")
          .addOption("Skill Gap", "Skill Gap (Knew but couldn't apply)")
          .addOption("Process Failure", "Process Failure (Planning/Time/Execution)")
          .setValue(this.failureType || (this.isProactiveMode ? "Process Failure" : ""))
          .onChange((value) => {
            this.failureType = value as FailureType;
            if (value === "Process Failure" && !this.selectedArchetypes.includes("process-failure")) {
                this.selectedArchetypes.push("process-failure");
                this.updateArchetypeDisplay(); 
            }
          })
      );

    // --- NEW: L42 Exam Phase ---
    new Setting(contentEl)
        .setName("Context: Exam Phase")
        .setDesc("Is this related to Prelims, Mains, or Interview?")
        .addDropdown(dropdown => {
            dropdown.addOption("", "Select...");
            // Added type annotation (phase: string)
            EXAM_PHASES.forEach((phase: string) => dropdown.addOption(phase, phase));
            dropdown.setValue(this.examPhase)
                    .onChange(v => this.examPhase = v);
        });

    // --- NEW: L41 Confidence Score ---
    new Setting(contentEl)
        .setName("Confidence Level (Before Failure)")
        .setDesc("How sure were you before you checked the answer? (1=Guessed, 5=Certain)")
        .addSlider(slider => slider
            .setLimits(1, 5, 1)
            .setValue(this.confidenceScore)
            .setDynamicTooltip()
            .onChange(v => this.confidenceScore = v)
        );

    // --- 2. Failure Archetype Tagging ---
    new Setting(contentEl)
      .setName("2. Failure Archetype(s)")
      .setDesc("Select one or more archetypes that describe the failure.")
      .addDropdown((dropdown) => {
        dropdown.addOption("", "Select...");
        this.lossLogService.getFailureArchetypes().forEach((archetype) => {
          dropdown.addOption(archetype, archetype);
        });
        dropdown.onChange((value) => {
          if (value && !this.selectedArchetypes.includes(value)) {
            this.selectedArchetypes.push(value);
            this.updateArchetypeDisplay(); 

            if (THREAD_TEMPLATES[value] && !this.ariadnesThread) { 
                if (confirm(`Suggest thread for '${value}': "${THREAD_TEMPLATES[value]}" Fill it in?`)) {
                    this.ariadnesThread = THREAD_TEMPLATES[value];
                    const threadTextArea = this.containerEl.querySelector('.ariadnes-thread-input') as HTMLTextAreaElement;
                    if (threadTextArea) {
                        threadTextArea.value = this.ariadnesThread;
                    }
                }
            }
          }
        });
      });
    
    const archetypeDisplay = contentEl.createDiv({ cls: "selected-archetypes-display" });
    archetypeDisplay.setText(`Selected: ${this.selectedArchetypes.join(", ") || "None"}`);

    // --- 3. Impact Score ---
    new Setting(contentEl)
      .setName("3. Estimated Impact Score") 
      .setDesc(this.isProactiveMode ? "Estimate impact if failure occurs (1-5)." : "Rate impact of failure (1-5).")
      .addSlider((slider) =>
        slider
          .setLimits(1, 5, 1)
          .setValue(this.impact)
          .onChange((value) => {
            this.impact = value;
          })
      );

    // --- 4. Source Task ---
    new Setting(contentEl)
      .setName(this.isProactiveMode ? "4. Anticipated Source Task" : "4. Source Task")
      .setDesc("What task or activity led to the failure?")
      .addText((text) =>
        text
          .setPlaceholder(this.isProactiveMode ? "e.g., Upcoming Mock GS2" : "e.g., Explain FRs vs DPSP")
          .setValue(this.sourceTask)
          .onChange((value) => {
            this.sourceTask = value;
            const lowerSourceTask = value.toLowerCase();
            for (const [keyword, suggestedArchetypes] of Object.entries(KEYWORD_SUGGESTIONS)) {
                if (lowerSourceTask.includes(keyword)) {
                    for (const archetype of suggestedArchetypes) {
                        if (!this.selectedArchetypes.includes(archetype)) {
                            this.selectedArchetypes.push(archetype);
                        }
                    }
                    this.updateArchetypeDisplay(); 
                }
            }
          })
      );

    // --- NEW: L43 & L44 (Grouped) ---
    const contextContainer = contentEl.createDiv({ cls: "loss-log-context-grid" });
    contextContainer.style.display = "grid";
    contextContainer.style.gridTemplateColumns = "1fr 1fr";
    contextContainer.style.gap = "10px";
    contextContainer.style.marginBottom = "10px";

    // Question Type (L43)
    new Setting(contextContainer)
        .setName("Question Type")
        .addDropdown(dropdown => {
            dropdown.addOption("", "N/A");
            // Added type annotation (qt: string)
            QUESTION_TYPES.forEach((qt: string) => dropdown.addOption(qt, qt));
            dropdown.onChange(v => this.questionType = v);
        });

    // Source Type (L44)
    new Setting(contextContainer)
        .setName("Source Material")
        .addDropdown(dropdown => {
            dropdown.addOption("", "N/A");
            // Added type annotation (st: string)
            SOURCE_TYPES.forEach((st: string) => dropdown.addOption(st, st));
            dropdown.onChange(v => this.sourceType = v);
        });

    // --- 5. Syllabus Topics ---
    new Setting(contentEl)
      .setName("5. Syllabus Topics")
      .setDesc("Link topics ([[Topic A]], [[Topic B]]).")
      .addText((text) =>
        text.setPlaceholder("[[Topic A]]").setValue(this.syllabusTopics).onChange((value) => this.syllabusTopics = value)
      );

    new Setting(contentEl)
      .setName("6. Syllabus Papers")
      .setDesc("#gs2, #essay")
      .addText((text) =>
        text.setPlaceholder("#gs2").setValue(this.syllabusPapers).onChange((value) => this.syllabusPapers = value)
      );

    // --- 6. Aura & Emotional State ---
    new Setting(contentEl)
      .setName("7. Energy & Emotion")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("#aura-high", "High Energy")
          .addOption("#aura-mid", "Medium Energy")
          .addOption("#aura-low", "Low Energy")
          .setValue(this.aura)
          .onChange((value) => this.aura = value)
      )
      .addDropdown((dropdown) =>
        dropdown
          .addOption("", "Select Emotion...")
          .addOption("Frustrated", "Frustrated")
          .addOption("Anxious", "Anxious")
          .addOption("Overconfident", "Overconfident") // Important for L83
          .setValue(this.emotionalState)
          .onChange((value) => this.emotionalState = value)
      );

    // --- 7. Root Cause Chain ---
    const causeSection = contentEl.createDiv({ cls: "root-cause-section" });
    causeSection.createEl("h4", { text: "8. Root Cause Analysis (5 Whys)" });
    const causeInputsContainer = causeSection.createDiv({ cls: "cause-inputs-container" });

    const renderCauseInputs = () => {
      causeInputsContainer.empty();
      this.rootCauseChain.forEach((cause, index) => {
        new Setting(causeInputsContainer)
          .addText((text) =>
            text
              .setPlaceholder(`Why ${index + 1}?`)
              .setValue(cause)
              .onChange((value) => this.rootCauseChain[index] = value)
          )
          .addExtraButton((button) =>
            button.setIcon("x").onClick(() => {
              if (this.rootCauseChain.length > 1) {
                this.rootCauseChain.splice(index, 1);
                renderCauseInputs();
              } else {
                this.rootCauseChain[0] = "";
              }
            })
          );
      });

      if (this.rootCauseChain.length < 5) {
        new Setting(causeInputsContainer)
          .addButton((btn) =>
            btn.setButtonText("+ Add Why").onClick(() => {
              this.rootCauseChain.push("");
              renderCauseInputs();
            })
          );
      }
    };
    renderCauseInputs();

    // --- 8. Ariadne's Thread ---
    new Setting(contentEl)
      .setName("9. Ariadne's Thread")
      .setDesc("What reusable principle will prevent this?")
      .addTextArea((textArea: TextAreaComponent) => {
        textArea
          .setPlaceholder("e.g., Always cross-check constitutional concepts...")
          .setValue(this.ariadnesThread)
          .onChange((value) => this.ariadnesThread = value);
        textArea.inputEl.rows = 3;
        textArea.inputEl.addClass("ariadnes-thread-input");
      });

    // --- 9. Counter-Factual ---
    new Setting(contentEl)
      .setName("10. Counter-Factual")
      .addTextArea((textArea: TextAreaComponent) => {
        textArea.setPlaceholder("e.g., Reviewed Laxmikanth Ch 6 first.").setValue(this.counterFactual).onChange((value) => this.counterFactual = value);
        textArea.inputEl.rows = 2;
      });

    // --- 10. Evidence & Link ---
    new Setting(contentEl).setName("11. Evidence").addText((text) => text.setValue(this.evidenceLink).onChange((v) => this.evidenceLink = v));
    new Setting(contentEl).setName("12. Linked Mock Test").addText((text) => text.setValue(this.linkedMockTest).onChange((v) => this.linkedMockTest = v));
    new Setting(contentEl).setName("13. Time-to-Failure").addText((text) => text.setValue(this.failureRealizationPoint).onChange((v) => this.failureRealizationPoint = v));

    // --- Auto-Generate Button ---
    new Setting(contentEl)
      .addButton((btn) =>
        btn.setButtonText("Auto-Generate Thread").onClick(() => {
          const potentialThread = this.rootCauseChain.find(cause => cause.toLowerCase().includes("next time"));
          if (potentialThread) {
            const match = potentialThread.match(/next time,?\s*i will\s+(.*)/i);
            if (match) {
                this.ariadnesThread = match[1].trim().charAt(0).toUpperCase() + match[1].trim().slice(1);
                const threadTextArea = this.containerEl.querySelector('.ariadnes-thread-input') as HTMLTextAreaElement;
                if (threadTextArea) threadTextArea.value = this.ariadnesThread;
            }
          }
        })
      );


// --- NEW: Deep Dive Section (L22) ---
        // Place this logic *after* all other settings, just before the Submit buttons
        
        const deepDiveContainer = this.contentEl.createDiv({ cls: "loss-log-deep-dive" });
        
        // Apply styles safely using Object.assign or .style property
        Object.assign(deepDiveContainer.style, {
            marginTop: "20px",
            paddingTop: "10px",
            borderTop: "1px solid var(--background-modifier-border)",
            textAlign: "center"
        });

        // FIX: Apply style to the returned element, not in options
        const smallText = deepDiveContainer.createEl("small", { text: "Is this failure a major revelation?" });
        smallText.style.color = "var(--text-muted)";
        
        const deepBtn = deepDiveContainer.createEl("button", { text: "🧪 Deepen with Alchemist's Log (L22)" });
        Object.assign(deepBtn.style, {
            width: "100%",
            marginTop: "5px"
        });
        
        deepBtn.onclick = () => {
            // 1. Close current modal
            this.close();
            
            // 2. Access Plugin via Service (using new getter)
            const plugin = this.lossLogService.getPlugin();
            
            // 3. Map Data
            // Safely handle syllabusTopics string splitting
            const mainTopic = this.syllabusTopics.split(',')[0]?.replace(/\[\[|\]\]/g, '').trim() || "General Failure";
            const rootCause = this.rootCauseChain.join(" -> ");

            // 4. Open Alchemist Modal
            plugin.openAlchemistLogModal({
                topic: mainTopic,
                taskText: this.sourceTask,
                // Pre-fill the log with context
                log: `**Failure Context**: ${this.sourceTask}\n**Root Cause**: ${rootCause}\n\nI realized that...`,
                difficultyCauses: ["Flawed Foundation"], // Default assumption for failures
                timestamp: Date.now()
            });
        };

    // --- Submit Buttons ---
    new Setting(contentEl)
      .addButton((btn) =>
        btn
          .setButtonText(this.isProactiveMode ? "Log Risk" : "Log Failure")
          .setCta()
          .onClick(() => this.submitForm(false))
      )
      .addButton((btn) =>
        btn.setButtonText("Log Later").onClick(() => this.submitForm(true))
      )
      .addButton((btn) =>
        btn.setButtonText("Cancel").onClick(() => this.close())
      );
  }

  private submitForm(isDeferred: boolean) {
    if (isDeferred) {
      if (!this.sourceTask.trim()) {
        new Notice("Cannot defer without a source task.");
        return;
      }
      const pendingItem: PendingLossLogContext = {
        sourceTask: this.sourceTask.trim(),
        initialFailureType: this.failureType || undefined,
        initialArchetypes: [...this.selectedArchetypes],
        initialAura: this.aura,
        initialSyllabusTopics: this.syllabusTopics ? this.syllabusTopics.split(",").map(t => t.trim()).filter(t => t) : undefined,
        originalTaskId: this.initialContext?.sourceTaskId,
        timestamp: new Date().toISOString(),
        isProactive: this.initialContext?.isProactiveMode,
        failureRealizationPoint: this.failureRealizationPoint,
      };
      this.lossLogService.addPendingLog(pendingItem);
      this.lossLogService.showEscapeMechanicNotice();
      this.close();
    } else {
      if (!this.failureType) { new Notice("Please select a Failure Type."); return; }
      if (this.selectedArchetypes.length === 0) { new Notice("Please select at least one Archetype."); return; }
      if (!this.sourceTask.trim()) { new Notice("Please enter Source Task."); return; }
      if (!this.ariadnesThread.trim()) { new Notice("Please define an Ariadne's Thread."); return; }

      const topicsArray = this.syllabusTopics.split(",").map((t) => t.trim()).filter((t) => t.length > 0);
      const papersArray = this.syllabusPapers.split(",").map((p) => p.trim()).filter((p) => p.length > 0);

      const lossData: LossLogData = {
        lossId: "",
        sourceTask: this.sourceTask.trim(),
        failureType: this.failureType,
        failureArchetypes: this.selectedArchetypes,
        impact: this.impact,
        syllabusTopics: topicsArray,
        syllabusPapers: papersArray,
        aura: this.aura,
        emotionalState: this.emotionalState || undefined,
        rootCauseChain: this.rootCauseChain.filter((c) => c.trim() !== ""),
        ariadnesThread: this.ariadnesThread.trim(),
        counterFactual: this.counterFactual.trim() || undefined,
        evidenceLink: this.evidenceLink.trim() || undefined,
        linkedMockTest: this.linkedMockTest.trim() || undefined,
        timestamp: new Date().toISOString(),
        provenance: {
          origin: this.initialContext?.isProactiveMode ? "scrying-pool" : "manual",
          sourceTaskId: this.initialContext?.sourceTaskId,
        },
        failureRealizationPoint: this.failureRealizationPoint || undefined,
        
        // --- NEW FIELDS ---
        confidenceScore: this.confidenceScore,
        questionType: this.questionType || undefined,
        sourceType: this.sourceType || undefined,
        examPhase: this.examPhase || undefined,
      };

      try {
        const preparedData = this.lossLogService.prepareLossLogData(lossData);
        this.lossLogService.createLossLog(preparedData).then(() => {
          if (this.onSubmit) this.onSubmit(preparedData);
          new Notice(`Labyrinth: ${this.isProactiveMode ? "Risk" : "Failure"} logged.`);
          this.lossLogService.showEscapeMechanicNotice();
          this.close();
        }).catch((error) => {
          console.error("Failed to submit:", error);
          new Notice("Failed to save. Check console.");
        });
      } catch (error) {
        console.error("Error preparing:", error);
      }
    }
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}