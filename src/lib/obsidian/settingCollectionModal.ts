import { App, Modal, Plugin } from "obsidian";
import SettingCollection from "../components/SettingCollection.svelte";

export { SettingCollectionModal };

class SettingCollectionModal extends Modal {
    settings: {[key: string]: boolean};
    settingsSubset: string[];

    constructor(app: App, settings: {[key: string]: boolean}, settingsSubset: string[]) {
        super(app);
        this.settings = settings;
        this.settingsSubset = settingsSubset;
    }

    onOpen(): void {
        const subsetSettings = this.settingsSubset.reduce((acc: {[key: string]: boolean}, key, index, array) => {
            if (!this.settings) return;
            acc[key] = this.settings[key];
            return acc;
        });
        let checkboxes = new SettingCollection({
            target: this.contentEl,
            props: {
                items: ['asdf', 'loool'],
                defaultValues: [false, true]
            }
        });
        checkboxes.$on('change', (event) => {
            const { index, value, allValues } = event.detail;
            console.log(`Checkbox at index ${index} changed to ${value}`);
            console.log("All checkbox values:", allValues);
        });
    }
}