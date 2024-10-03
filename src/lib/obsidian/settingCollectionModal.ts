import { App, Modal, Plugin } from "obsidian";
import SettingCollection from "../components/SettingCollection.svelte";

export { SettingCollectionModal };

export interface BooleanSetting {
    key: string;
    displayName: string;
    value: boolean;
}


/**
 * Presents a collection of settings to be changed.
 * 
 * @example
 * ```ts
 *  new SettingCollectionModal(this, settings, async (settings) => {
 *      console.log(this.settings);
 *      settings.forEach(async (setting, index) => {
 *          if (setting.key !== undefined) {
 *              const settingKey: keyof MyPluginSettings = setting.key
 *              if (!this.settings[settingKey]) return;
 *              this.settings[settingKey] = setting.value;
 *              console.log(`set ${this.settings[settingKey]}`);
 *          }
 *          await this.saveSettings();
 *      });
 *  }).open();
 *  ```
 */
class SettingCollectionModal extends Modal {
    settings: BooleanSetting[];
    plugin: Plugin;
    onSubmit: ((updatedSettings: BooleanSetting[]) => void) | undefined;
    
    /**
     * Creates a new SettingCollectionModal
     * @param plugin an Obsidian plugin
     * @param settings an array of Boolean settings
     * @param onSubmit a callback which updates settings in your plugin
     */
    constructor(plugin: Plugin, settings: BooleanSetting[], onSubmit?: (updatedSettings: BooleanSetting[]) => void) {
        super(plugin.app);
        this.settings = settings;
        this.plugin = plugin;
        this.onSubmit = onSubmit;
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
            const index = this.settings.findIndex(setting => setting.key === item.key);
            if (index !== -1) {
                this.settings[index].value = item.value;
            } else {
                console.log(`Setting with key "${String(item.key)}" not found.`);
            }
            // a callback which will save settings for the plugin
            if (this.onSubmit) this.onSubmit(this.settings);
        });
    }
}