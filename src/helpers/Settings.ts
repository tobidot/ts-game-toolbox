/**
 * --------------------------------------------------------------------------------
 * 								Basic Interfaces
 * --------------------------------------------------------------------------------
*/

/**
 * Indicate that a class has a settings property
 */
interface HasSetting {
    settings: { [k: string]: any };
}

/**
 * Indicate that a class has a default_settings property.
 * (should be static)
 */
interface HasDefaultSettingStatic {
    default_settings: { [k: string]: any };
}

/**
 * --------------------------------------------------------------------------------
 * 								Helper Types
 * --------------------------------------------------------------------------------
*/

/**
 * Get the settings type of an instance
 */
type Settings<INSTANCE extends HasSetting> = INSTANCE["settings"];
/**
 * Get the default settings type of a class
 */
type DefaultSettings<CLASS extends HasDefaultSettingStatic> = CLASS["default_settings"];

/**
 * Get the keys of a setting that are not required because they have defaults
 */
type SettingsOptionalKeys<INSTANCE extends HasSetting, CLASS extends HasDefaultSettingStatic>
    = keyof DefaultSettings<CLASS> & keyof Settings<INSTANCE>;
/**
 * Get the keys of a setting that are required because they don't have defaults
 */
type SettingsRequiredKeys<INSTANCE extends HasSetting, CLASS extends HasDefaultSettingStatic>
    = Exclude<keyof Settings<INSTANCE>, keyof DefaultSettings<CLASS>>;
/**
 * Get the object type of the optional settings
 */
type SettingsOptional<INSTANCE extends HasSetting, CLASS extends HasDefaultSettingStatic>
    = Partial<Pick<INSTANCE["settings"],SettingsOptionalKeys<INSTANCE, CLASS>>>
/**
 * Get the object type of the required settings
 */
type SettingsRequired<INSTANCE extends HasSetting, CLASS extends HasDefaultSettingStatic> 
    = Required<Pick<INSTANCE["settings"],SettingsRequiredKeys<INSTANCE, CLASS>>>;
/**
 * --------------------------------------------------------------------------------
 * 								Export Types
 * --------------------------------------------------------------------------------
*/

/**
 * Declare an settings input type that requires all values from settings property in a class
 * except for the values found in the default_settings 
 */
export type WithDefaultSettings<INSTANCE extends HasSetting, CLASS extends HasDefaultSettingStatic>
    = SettingsRequired<INSTANCE, CLASS> & SettingsOptional<INSTANCE, CLASS>;