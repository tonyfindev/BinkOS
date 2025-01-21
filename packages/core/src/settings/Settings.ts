import { config, DotenvConfigOutput } from 'dotenv';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

export type SettingsOptions = {
  defaultValues?: Record<string, string>;
  envFiles?: string[];
  throwOnMissing?: boolean;
};

export class Settings {
  private configStore: Map<string, string>;
  private static instance: Settings | null = null;
  private options: Required<SettingsOptions>;

  private constructor(options: SettingsOptions = {}) {
    this.options = {
      defaultValues: options.defaultValues || {},
      envFiles: options.envFiles || [
        '.env.local',
        '.env.development',
        '.env',
        '.env.production',
        '.env.test'
      ],
      throwOnMissing: options.throwOnMissing || false
    };
    
    this.configStore = new Map();
    this.initialize();
  }

  public static getInstance(options?: SettingsOptions): Settings {
    if (!Settings.instance) {
      Settings.instance = new Settings(options);
    }
    return Settings.instance;
  }

  public static resetInstance(): void {
    Settings.instance = null;
  }

  private initialize(): void {
    // Load default values first (lowest priority)
    Object.entries(this.options.defaultValues).forEach(([key, value]) => {
      this.set(key, value);
    });

    // Load from env files (middle priority)
    this.loadFromEnvFiles();

    // Load from process.env (highest priority)
    this.loadFromProcessEnv();
  }

  private loadFromEnvFiles(): void {
    for (const file of this.options.envFiles) {
      try {
        const filePath = join(process.cwd(), file);
        if (!existsSync(filePath)) continue;

        const result = config({ path: filePath });
        if (result.error) {
          console.warn(`Warning: Error loading ${file}: ${result.error.message}`);
          continue;
        }

        if (result.parsed) {
          Object.entries(result.parsed).forEach(([key, value]) => {
            if (typeof value === 'string') {
              this.set(key, value);
            }
          });
        }
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.warn(`Warning: Failed to load ${file}: ${errorMessage}`);
      }
    }
  }

  private loadFromProcessEnv(): void {
    Object.entries(process.env).forEach(([key, value]) => {
      if (typeof value === 'string') {
        this.set(key, value);
      }
    });
  }

  /**
   * Set a configuration value
   * @param key The configuration key
   * @param value The configuration value
   */
  public set(key: string, value: string): void {
    this.configStore.set(key.toUpperCase(), value);
  }

  /**
   * Get a configuration value
   * @param key The configuration key
   * @param defaultValue Optional default value if key is not found
   * @returns The configuration value or undefined/default if not found
   */
  public get(key: string, defaultValue?: string): string | undefined {
    const value = this.configStore.get(key.toUpperCase());
    
    if (value === undefined) {
      if (this.options.throwOnMissing && defaultValue === undefined) {
        throw new Error(`Required configuration key "${key}" is not set`);
      }
      return defaultValue;
    }
    
    return value;
  }

  /**
   * Get a required configuration value
   * @param key The configuration key
   * @throws Error if the configuration value is not found
   */
  public getRequired(key: string): string {
    const value = this.get(key);
    if (value === undefined) {
      throw new Error(`Required configuration key "${key}" is not set`);
    }
    return value;
  }

  /**
   * Get a boolean configuration value
   * @param key The configuration key
   * @param defaultValue Optional default value if key is not found
   */
  public getBoolean(key: string, defaultValue?: boolean): boolean | undefined {
    const value = this.get(key);
    if (value === undefined) return defaultValue;
    return value.toLowerCase() === 'true' || value === '1';
  }

  /**
   * Get a number configuration value
   * @param key The configuration key
   * @param defaultValue Optional default value if key is not found
   */
  public getNumber(key: string, defaultValue?: number): number | undefined {
    const value = this.get(key);
    if (value === undefined) return defaultValue;
    const num = Number(value);
    return isNaN(num) ? defaultValue : num;
  }

  /**
   * Check if a configuration key exists
   * @param key The configuration key
   */
  public has(key: string): boolean {
    return this.configStore.has(key.toUpperCase());
  }

  /**
   * Delete a configuration value
   * @param key The configuration key
   */
  public delete(key: string): boolean {
    return this.configStore.delete(key.toUpperCase());
  }

  /**
   * Get all configuration keys
   */
  public getAllKeys(): string[] {
    return Array.from(this.configStore.keys());
  }

  /**
   * Get all configuration entries
   */
  public getAllEntries(): [string, string][] {
    return Array.from(this.configStore.entries());
  }

  /**
   * Clear all configuration values
   */
  public clear(): void {
    this.configStore.clear();
  }

  /**
   * Reload all configuration values
   */
  public reload(): void {
    this.clear();
    this.initialize();
  }
}

// Export singleton instance with default options
export const settings = Settings.getInstance(); 