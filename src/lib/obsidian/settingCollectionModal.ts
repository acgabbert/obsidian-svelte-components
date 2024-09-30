import { App, Modal, Plugin } from "obsidian";
import SettingCollection from "../components/SettingCollection.svelte";
import type { CyberPlugin } from "obsidian-cyber-utils";

export { SettingCollectionModal };

export interface BooleanSetting {
    key: string;
    displayName: string;
    value: boolean;
}

class SettingCollectionModal extends Modal {
    settings: BooleanSetting[];

    constructor(app: App, settings: BooleanSetting[]) {
        super(app);
        this.settings = settings;
    }

    onOpen(): void {
        let checkboxes = new SettingCollection({
            target: this.contentEl,
            props: {
                items: this.settings
            }
        });
        checkboxes.$on('change', (event: { detail: BooleanSetting; }) => {
            const item = event.detail;
            console.log(`Checkbox for setting ${item.displayName} changed to ${item.value}`);
            const index = this.settings.findIndex(setting => setting.key === item.key);
            if (index !== -1) {
                console.log(`updating index ${index}`)
                this.settings[index].value = item.value;
            } else {
                console.log(`Setting with key "${item.key}" not found.`);
            }
            console.log(this.settings);
        });
    }
}