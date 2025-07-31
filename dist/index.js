"use strict";
/**
 * Smart Dependency Analyzer - Main Entry Point
 * Export all public APIs for programmatic usage
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.version = void 0;
// Core types
__exportStar(require("./types"), exports);
// CLI entry point
// export { main as runCLI } from './cli';
// Core services (Phase 1+)
// export * from './core/services';
// Analyzers (Phase 2+)
// export * from './analyzers';
// Intelligence (Phase 6+)
// export * from './intelligence';
// API (Phase 7+)
// export * from './api';
// Utils
__exportStar(require("./utils/logger"), exports);
// Version info
var package_json_1 = require("../package.json");
Object.defineProperty(exports, "version", { enumerable: true, get: function () { return package_json_1.version; } });
//# sourceMappingURL=index.js.map