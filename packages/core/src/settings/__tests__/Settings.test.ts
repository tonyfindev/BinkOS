import { Settings, settings } from '../';
import { config } from 'dotenv';
import { existsSync } from 'fs';
import { join } from 'path';

// Mock the external dependencies
jest.mock('dotenv');
jest.mock('fs');
jest.mock('path');

describe('Settings', () => {
  // Spy on console.warn to suppress and verify warnings
  let consoleWarnSpy: jest.SpyInstance;

  beforeEach(() => {
    // Reset all mocks before each test
    jest.clearAllMocks();
    Settings.resetInstance();

    // Mock process.env
    process.env = {};

    // Mock path.join to return the input path
    (join as jest.Mock).mockImplementation((...paths) => paths.join('/'));

    // Mock existsSync to return false by default (no env files exist)
    (existsSync as jest.Mock).mockReturnValue(false);

    // Mock dotenv config to return empty parsed values by default
    (config as jest.Mock).mockReturnValue({ parsed: null });

    // Spy on console.warn
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
  });

  describe('Singleton Pattern', () => {
    it('should create only one instance', () => {
      const instance1 = Settings.getInstance();
      const instance2 = Settings.getInstance();
      expect(instance1).toBe(instance2);
    });

    it('should create new instance after reset', () => {
      const instance1 = Settings.getInstance();
      Settings.resetInstance();
      const instance2 = Settings.getInstance();
      expect(instance1).not.toBe(instance2);
    });
  });

  describe('Environment Loading', () => {
    beforeEach(() => {
      // Reset warning spy for each test
      consoleWarnSpy.mockClear();
    });

    it('should load values from process.env', () => {
      process.env.TEST_KEY = 'test_value';
      const instance = Settings.getInstance();
      expect(instance.get('TEST_KEY')).toBe('test_value');
      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });

    it('should load values from .env files', () => {
      (existsSync as jest.Mock).mockReturnValue(true);
      (config as jest.Mock).mockReturnValue({
        parsed: { TEST_KEY: 'env_value' }
      });
      const instance = Settings.getInstance();
      expect(instance.get('TEST_KEY')).toBe('env_value');
      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });

    it('should handle missing .env files gracefully', () => {
      (existsSync as jest.Mock).mockReturnValue(false);
      Settings.getInstance();
      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });

    it('should handle .env parsing errors gracefully', () => {
      (existsSync as jest.Mock).mockReturnValue(true);
      (config as jest.Mock).mockReturnValue({
        error: new Error('Parse error'),
        parsed: null
      });
      Settings.getInstance();
      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('Parse error'));
    });

    it('should respect loading priority (process.env over .env)', () => {
      (existsSync as jest.Mock).mockReturnValue(true);
      process.env.PRIORITY_TEST = 'process_value';
      (config as jest.Mock).mockReturnValue({
        parsed: { PRIORITY_TEST: 'env_value' }
      });
      const instance = Settings.getInstance();
      expect(instance.get('PRIORITY_TEST')).toBe('process_value');
      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });
  });

  describe('Custom Options', () => {
    it('should use custom env files', () => {
      const customFiles = ['.env.custom'];
      Settings.getInstance({ envFiles: customFiles });
      expect(join).toHaveBeenCalledWith(expect.any(String), '.env.custom');
      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });

    it('should use default values', () => {
      const instance = Settings.getInstance({
        defaultValues: { DEFAULT_KEY: 'default_value' }
      });
      expect(instance.get('DEFAULT_KEY')).toBe('default_value');
      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });

    it('should throw on missing values when configured', () => {
      const instance = Settings.getInstance({ throwOnMissing: true });
      expect(() => instance.get('MISSING_KEY')).toThrow();
      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });
  });

  describe('Value Getters', () => {
    let instance: Settings;

    beforeEach(() => {
      instance = Settings.getInstance();
      instance.set('STRING_KEY', 'value');
      instance.set('BOOLEAN_TRUE', 'true');
      instance.set('BOOLEAN_FALSE', 'false');
      instance.set('NUMBER_KEY', '123');
    });

    it('should get string values', () => {
      expect(instance.get('STRING_KEY')).toBe('value');
      expect(instance.get('MISSING_KEY')).toBeUndefined();
      expect(instance.get('MISSING_KEY', 'default')).toBe('default');
    });

    it('should get boolean values', () => {
      expect(instance.getBoolean('BOOLEAN_TRUE')).toBe(true);
      expect(instance.getBoolean('BOOLEAN_FALSE')).toBe(false);
      expect(instance.getBoolean('MISSING_KEY')).toBeUndefined();
      expect(instance.getBoolean('MISSING_KEY', true)).toBe(true);
    });

    it('should get number values', () => {
      expect(instance.getNumber('NUMBER_KEY')).toBe(123);
      expect(instance.getNumber('STRING_KEY')).toBe(undefined);
      expect(instance.getNumber('MISSING_KEY')).toBeUndefined();
      expect(instance.getNumber('MISSING_KEY', 456)).toBe(456);
    });

    it('should get required values', () => {
      expect(instance.getRequired('STRING_KEY')).toBe('value');
      expect(() => instance.getRequired('MISSING_KEY')).toThrow();
    });
  });

  describe('Value Management', () => {
    let instance: Settings;

    beforeEach(() => {
      instance = Settings.getInstance();
      instance.set('TEST_KEY', 'test_value');
    });

    it('should set and get values case-insensitively', () => {
      instance.set('MIXED_CASE', 'value');
      expect(instance.get('mixed_case')).toBe('value');
      expect(instance.get('MIXED_CASE')).toBe('value');
    });

    it('should check if key exists', () => {
      expect(instance.has('TEST_KEY')).toBe(true);
      expect(instance.has('MISSING_KEY')).toBe(false);
    });

    it('should delete values', () => {
      expect(instance.delete('TEST_KEY')).toBe(true);
      expect(instance.get('TEST_KEY')).toBeUndefined();
      expect(instance.delete('MISSING_KEY')).toBe(false);
    });

    it('should get all keys', () => {
      instance.set('ANOTHER_KEY', 'value');
      const keys = instance.getAllKeys();
      expect(keys).toContain('TEST_KEY');
      expect(keys).toContain('ANOTHER_KEY');
    });

    it('should get all entries', () => {
      const entries = instance.getAllEntries();
      expect(entries).toContainEqual(['TEST_KEY', 'test_value']);
    });

    it('should clear all values', () => {
      instance.clear();
      expect(instance.getAllKeys()).toHaveLength(0);
    });

    it('should reload values', () => {
      instance.clear();
      process.env.RELOAD_TEST = 'reload_value';
      instance.reload();
      expect(instance.get('RELOAD_TEST')).toBe('reload_value');
    });
  });
}); 