/**
 * License Detector Service
 * Advanced license detection using SPDX identifiers, file analysis, and NLP
 */

import { readFile, access } from 'fs/promises';
import { join } from 'path';
import type { Package } from '../../types';
import type { 
  License, 
  LicenseAnalysis, 
  LicenseObligation,
  LicenseScanOptions 
} from '../../types/license';
import { LicenseCategory, ObligationType, LegalRiskLevel } from '../../types/license';
import { getLicenseDatabase } from './license-database';
import { logger } from '../../utils/logger';

/**
 * License file patterns to search for
 */
const LICENSE_FILE_PATTERNS = [
  'LICENSE',
  'LICENSE.txt',
  'LICENSE.md',
  'LICENCE',
  'LICENCE.txt',
  'LICENCE.md',
  'COPYING',
  'COPYING.txt',
  'COPYRIGHT',
  'COPYRIGHT.txt',
  'NOTICE',
  'NOTICE.txt'
];

/**
 * Common license text patterns for detection
 */
const LICENSE_TEXT_PATTERNS = [
  {
    pattern: /MIT License|Permission is hereby granted, free of charge/i,
    spdxId: 'MIT',
    confidence: 0.9
  },
  {
    pattern: /Apache License.*Version 2\.0/i,
    spdxId: 'Apache-2.0',
    confidence: 0.9
  },
  {
    pattern: /GNU GENERAL PUBLIC LICENSE.*Version 3/i,
    spdxId: 'GPL-3.0-only',
    confidence: 0.9
  },
  {
    pattern: /GNU GENERAL PUBLIC LICENSE.*Version 2/i,
    spdxId: 'GPL-2.0-only',
    confidence: 0.9
  },
  {
    pattern: /GNU LESSER GENERAL PUBLIC LICENSE.*Version 3/i,
    spdxId: 'LGPL-3.0-only',
    confidence: 0.9
  },
  {
    pattern: /GNU LESSER GENERAL PUBLIC LICENSE.*Version 2\.1/i,
    spdxId: 'LGPL-2.1-only',
    confidence: 0.9
  },
  {
    pattern: /Mozilla Public License.*Version 2\.0/i,
    spdxId: 'MPL-2.0',
    confidence: 0.9
  },
  {
    pattern: /BSD.*3.*Clause|Redistribution and use in source and binary forms.*with or without modification/i,
    spdxId: 'BSD-3-Clause',
    confidence: 0.8
  },
  {
    pattern: /BSD.*2.*Clause/i,
    spdxId: 'BSD-2-Clause',
    confidence: 0.8
  },
  {
    pattern: /ISC License|Permission to use, copy, modify.*is hereby granted/i,
    spdxId: 'ISC',
    confidence: 0.8
  },
  {
    pattern: /Creative Commons Zero.*Universal|CC0/i,
    spdxId: 'CC0-1.0',
    confidence: 0.8
  },
  {
    pattern: /This is free and unencumbered software released into the public domain/i,
    spdxId: 'Unlicense',
    confidence: 0.9
  }
];

/**
 * Advanced license detector with multiple detection strategies
 */
export class LicenseDetector {
  private licenseDb = getLicenseDatabase();

  /**
   * Detect license for a package using multiple strategies
   */
  public async detectLicense(
    pkg: Package, 
    options: LicenseScanOptions = this.getDefaultOptions()
  ): Promise<LicenseAnalysis> {
    const startTime = Date.now();
    logger.info(`🔍 Analyzing license for package: ${pkg.name}@${pkg.version}`);

    try {
      // Strategy 1: Check declared license in package.json
      const declaredLicense = await this.detectDeclaredLicense(pkg);
      
      // Strategy 2: Analyze license files
      const licenseFiles = await this.analyzeLicenseFiles(pkg, options);
      
      // Strategy 3: Extract copyright statements
      const copyrightStatements = await this.extractCopyrightStatements(pkg, options);
      
      // Consolidate and rank detected licenses
      const licenses = await this.consolidateLicenses(declaredLicense, licenseFiles);
      
      // Determine primary license
      const primaryLicense = this.determinePrimaryLicense(licenses, declaredLicense);
      
      // Calculate obligations
      const obligations = this.calculateObligations(licenses);
      
      // Assess legal risk
      const riskLevel = this.assessLegalRisk(licenses, obligations);
      
      // Detect issues
      const issues = this.detectIssues(pkg, licenses, declaredLicense, licenseFiles);
      
      const scanDuration = Date.now() - startTime;
      
      const analysis: LicenseAnalysis = {
        package: {
          name: pkg.name,
          version: pkg.version
        },
        licenses,
        ...(primaryLicense && { primaryLicense }),
        detectionMethod: this.determineDetectionMethod(declaredLicense, licenseFiles),
        licenseFiles,
        copyrightStatements,
        obligations,
        riskLevel,
        issues,
        metadata: {
          analyzedAt: new Date(),
          analyzer: 'LicenseDetector',
          version: '1.0.0',
          scanDuration
        }
      };

      logger.info(`✅ License analysis completed in ${scanDuration}ms - Found ${licenses.length} licenses`);
      return analysis;

    } catch (error) {
      logger.error('License detection failed:', error);
      throw new Error(`License detection failed for ${pkg.name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Detect declared license from package.json
   */
  private async detectDeclaredLicense(pkg: Package): Promise<License | undefined> {
    if (!pkg.license) return undefined;

    // Handle SPDX expression parsing
    const licenseExpression = pkg.license.trim();
    
    // Simple case: single license
    const license = this.licenseDb.getLicense(licenseExpression);
    if (license) {
      return { ...license, confidence: 1.0 };
    }

    // Try to parse complex expressions (simplified)
    const cleanedExpression = licenseExpression
      .replace(/\s+OR\s+/gi, ' OR ')
      .replace(/\s+AND\s+/gi, ' AND ')
      .replace(/[()]/g, '');

    const parts = cleanedExpression.split(/\s+(?:OR|AND)\s+/);
    for (const part of parts) {
      const partLicense = this.licenseDb.getLicense(part.trim());
      if (partLicense) {
        return { ...partLicense, confidence: 0.8 };
      }
    }

    return undefined;
  }

  /**
   * Analyze license files in the package
   */
  private async analyzeLicenseFiles(
    pkg: Package, 
    _options: LicenseScanOptions
  ): Promise<Array<{ path: string; license: License; confidence: number }>> {
    const licenseFiles: Array<{ path: string; license: License; confidence: number }> = [];
    
    if (!pkg.path) return licenseFiles;

    for (const pattern of LICENSE_FILE_PATTERNS) {
      const filePath = join(pkg.path, pattern);
      
      try {
        await access(filePath);
        const content = await readFile(filePath, 'utf-8');
        const detectedLicense = await this.analyzeLicenseText(content);
        
        if (detectedLicense) {
          licenseFiles.push({
            path: pattern,
            license: detectedLicense.license,
            confidence: detectedLicense.confidence
          });
        }
      } catch {
        // File doesn't exist, continue
      }
    }

    return licenseFiles;
  }

  /**
   * Analyze license text content using pattern matching
   */
  private async analyzeLicenseText(content: string): Promise<{ license: License; confidence: number } | undefined> {
    const normalizedContent = content.replace(/\s+/g, ' ').trim();

    for (const pattern of LICENSE_TEXT_PATTERNS) {
      if (pattern.pattern.test(normalizedContent)) {
        const license = this.licenseDb.getLicense(pattern.spdxId);
        if (license) {
          return {
            license: { ...license, confidence: pattern.confidence },
            confidence: pattern.confidence
          };
        }
      }
    }

    return undefined;
  }

  /**
   * Extract copyright statements from license files
   */
  private async extractCopyrightStatements(
    pkg: Package, 
    _options: LicenseScanOptions
  ): Promise<string[]> {
    const copyrightStatements: string[] = [];
    
    if (!pkg.path) return copyrightStatements;

    const copyrightPattern = /Copyright\s+(?:\(c\)\s*)?(?:(?:19|20)\d{2}(?:\s*[-–]\s*(?:19|20)\d{2})?\s+)?(.+)/gi;

    for (const pattern of LICENSE_FILE_PATTERNS) {
      const filePath = join(pkg.path, pattern);
      
      try {
        await access(filePath);
        const content = await readFile(filePath, 'utf-8');
        
        let match;
        while ((match = copyrightPattern.exec(content)) !== null) {
          const statement = match[0].trim();
          if (statement && !copyrightStatements.includes(statement)) {
            copyrightStatements.push(statement);
          }
        }
      } catch {
        // File doesn't exist, continue
      }
    }

    return copyrightStatements;
  }

  /**
   * Consolidate detected licenses and remove duplicates
   */
  private async consolidateLicenses(
    declaredLicense: License | undefined,
    licenseFiles: Array<{ path: string; license: License; confidence: number }>
  ): Promise<License[]> {
    const licenseMap = new Map<string, License>();

    // Add declared license
    if (declaredLicense) {
      licenseMap.set(declaredLicense.spdxId, declaredLicense);
    }

    // Add licenses from files
    for (const fileInfo of licenseFiles) {
      const existing = licenseMap.get(fileInfo.license.spdxId);
      if (!existing || fileInfo.confidence > (existing.confidence || 0)) {
        licenseMap.set(fileInfo.license.spdxId, fileInfo.license);
      }
    }

    return Array.from(licenseMap.values());
  }

  /**
   * Determine the primary license (most permissive or declared)
   */
  private determinePrimaryLicense(
    licenses: License[],
    declaredLicense: License | undefined
  ): License | undefined {
    if (licenses.length === 0) return undefined;
    if (licenses.length === 1) return licenses[0];

    // Prefer declared license if it exists
    if (declaredLicense) {
      const found = licenses.find(l => l.spdxId === declaredLicense.spdxId);
      if (found) return found;
    }

    // Prefer permissive licenses over copyleft
    const permissive = licenses.filter(l => l.category === LicenseCategory.PERMISSIVE);
    if (permissive.length > 0) {
      return permissive.sort((a, b) => (b.confidence || 0) - (a.confidence || 0))[0];
    }

    // Return highest confidence license
    return licenses.sort((a, b) => (b.confidence || 0) - (a.confidence || 0))[0];
  }

  /**
   * Calculate all obligations from detected licenses
   */
  private calculateObligations(licenses: License[]): LicenseObligation[] {
    const obligationMap = new Map<ObligationType, LicenseObligation>();

    for (const license of licenses) {
      for (const obligationType of license.obligations) {
        if (!obligationMap.has(obligationType)) {
          obligationMap.set(obligationType, this.createObligation(obligationType, license));
        }
      }
    }

    return Array.from(obligationMap.values());
  }

  /**
   * Create license obligation details
   */
  private createObligation(type: ObligationType, _license: License): LicenseObligation {
    const obligationDetails: Record<ObligationType, Omit<LicenseObligation, 'type'>> = {
      [ObligationType.ATTRIBUTION]: {
        description: 'Must include attribution to original authors',
        severity: 'medium',
        scope: 'distribution'
      },
      [ObligationType.COPYLEFT]: {
        description: 'Must release derivative works under same license',
        severity: 'high',
        scope: 'project'
      },
      [ObligationType.DISCLOSE_SOURCE]: {
        description: 'Must make source code available',
        severity: 'high',
        scope: 'distribution'
      },
      [ObligationType.SAME_LICENSE]: {
        description: 'Must use same license for derivative works',
        severity: 'high',
        scope: 'project'
      },
      [ObligationType.PATENT_GRANT]: {
        description: 'Includes patent grant and termination clauses',
        severity: 'medium',
        scope: 'component'
      },
      [ObligationType.NO_COMMERCIAL_USE]: {
        description: 'Prohibits commercial use',
        severity: 'critical',
        scope: 'project'
      },
      [ObligationType.SHARE_ALIKE]: {
        description: 'Must share adaptations under same license',
        severity: 'high',
        scope: 'project'
      },
      [ObligationType.NOTICE_PRESERVATION]: {
        description: 'Must preserve copyright and license notices',
        severity: 'medium',
        scope: 'file'
      }
    };

    return {
      type,
      ...obligationDetails[type]
    };
  }

  /**
   * Assess legal risk based on licenses and obligations
   */
  private assessLegalRisk(licenses: License[], obligations: LicenseObligation[]): LegalRiskLevel {
    let riskScore = 0;

    // Base risk from license categories
    for (const license of licenses) {
      switch (license.category) {
        case LicenseCategory.PERMISSIVE:
          riskScore += 1;
          break;
        case LicenseCategory.WEAK_COPYLEFT:
          riskScore += 3;
          break;
        case LicenseCategory.COPYLEFT:
          riskScore += 5;
          break;
        case LicenseCategory.PROPRIETARY:
          riskScore += 10;
          break;
        case LicenseCategory.CUSTOM:
          riskScore += 7;
          break;
        case LicenseCategory.UNKNOWN:
          riskScore += 8;
          break;
        case LicenseCategory.PUBLIC_DOMAIN:
          riskScore += 0;
          break;
      }
    }

    // Additional risk from obligations
    for (const obligation of obligations) {
      switch (obligation.severity) {
        case 'critical':
          riskScore += 10;
          break;
        case 'high':
          riskScore += 5;
          break;
        case 'medium':
          riskScore += 2;
          break;
        case 'low':
          riskScore += 1;
          break;
      }
    }

    // Convert score to risk level
    if (riskScore >= 20) return LegalRiskLevel.CRITICAL;
    if (riskScore >= 15) return LegalRiskLevel.VERY_HIGH;
    if (riskScore >= 10) return LegalRiskLevel.HIGH;
    if (riskScore >= 5) return LegalRiskLevel.MEDIUM;
    if (riskScore >= 2) return LegalRiskLevel.LOW;
    return LegalRiskLevel.VERY_LOW;
  }

  /**
   * Detect issues with license analysis
   */
  private detectIssues(
    pkg: Package,
    licenses: License[],
    declaredLicense: License | undefined,
    _licenseFiles: Array<{ path: string; license: License; confidence: number }>
  ): Array<{
    type: 'missing_license' | 'conflicting_licenses' | 'deprecated_license' | 'unrecognized_license';
    severity: 'warning' | 'error' | 'critical';
    description: string;
    file?: string;
  }> {
    const issues: Array<{
      type: 'missing_license' | 'conflicting_licenses' | 'deprecated_license' | 'unrecognized_license';
      severity: 'warning' | 'error' | 'critical';
      description: string;
      file?: string;
    }> = [];

    // Missing license
    if (licenses.length === 0) {
      issues.push({
        type: 'missing_license',
        severity: 'error',
        description: 'No license detected in package'
      });
    }

    // Conflicting licenses
    if (licenses.length > 1) {
      const hasIncompatible = this.hasIncompatibleLicenses(licenses);
      if (hasIncompatible) {
        issues.push({
          type: 'conflicting_licenses',
          severity: 'critical',
          description: `Potentially incompatible licenses: ${licenses.map(l => l.spdxId).join(', ')}`
        });
      }
    }

    // Deprecated licenses
    for (const license of licenses) {
      if (license.deprecatedIds && license.deprecatedIds.length > 0) {
        issues.push({
          type: 'deprecated_license',
          severity: 'warning',
          description: `License ${license.spdxId} has deprecated identifiers`
        });
      }
    }

    // Unrecognized license in package.json
    if (pkg.license && !declaredLicense) {
      issues.push({
        type: 'unrecognized_license',
        severity: 'warning',
        description: `Unrecognized license identifier: ${pkg.license}`
      });
    }

    return issues;
  }

  /**
   * Check if licenses are incompatible
   */
  private hasIncompatibleLicenses(licenses: License[]): boolean {
    const categories = licenses.map(l => l.category);
    
    // Simplified compatibility check
    const hasProprietary = categories.includes(LicenseCategory.PROPRIETARY);
    
    // Proprietary with anything else is problematic
    if (hasProprietary && licenses.length > 1) return true;
    
    // Multiple strong copyleft licenses can be problematic
    const copyleftCount = categories.filter(c => c === LicenseCategory.COPYLEFT).length;
    if (copyleftCount > 1) return true;
    
    return false;
  }

  /**
   * Determine the detection method used
   */
  private determineDetectionMethod(
    declaredLicense: License | undefined,
    licenseFiles: Array<{ path: string; license: License; confidence: number }>
  ): 'declared' | 'file_analysis' | 'heuristic' | 'manual' {
    if (declaredLicense && licenseFiles.length > 0) {
      return 'declared';
    }
    if (licenseFiles.length > 0) {
      return 'file_analysis';
    }
    if (declaredLicense) {
      return 'heuristic';
    }
    return 'manual';
  }

  /**
   * Get default scan options
   */
  private getDefaultOptions(): LicenseScanOptions {
    return {
      scanDepth: 'direct',
      includeDevDependencies: true,
      scanPatterns: ['LICENSE*', 'COPYING*', 'COPYRIGHT*', 'NOTICE*'],
      ignorePatterns: ['node_modules/**', '.git/**'],
      confidenceThreshold: 0.7,
      useCache: true,
      failOnPolicyViolation: false
    };
  }
}

/**
 * Create a license detector instance
 */
export function createLicenseDetector(): LicenseDetector {
  return new LicenseDetector();
}
