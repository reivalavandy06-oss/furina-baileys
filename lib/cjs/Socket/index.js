"use strict";
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
const communities_1 = require("./communities");
__exportStar(require("./chats"), exports);
__exportStar(require("./groups"), exports);
__exportStar(require("./messages-send"), exports);
__exportStar(require("./messages-recv"), exports);
__exportStar(require("./socket"), exports);
__exportStar(require("./newsletter"), exports);
__exportStar(require("./business"), exports);
__exportStar(require("./mex"), exports);
__exportStar(require("./communities"), exports);
exports.default = communities_1.makeCommunitiesSocket;
//# sourceMappingURL=index.js.map