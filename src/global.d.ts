// global.d.ts
import 'obsidian'; // Or the relevant module where 'App' is defined

declare module 'obsidian' { // Or the relevant module
  interface App {
    commands: any; // Or a more specific type if you know it
  }
}