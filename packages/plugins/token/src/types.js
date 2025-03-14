"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TokenInfoSchema = void 0;
const core_1 = require("@binkai/core");
const zod_1 = require("zod");
exports.TokenInfoSchema = zod_1.z.object({
    address: zod_1.z.string(),
    symbol: zod_1.z.string(),
    name: zod_1.z.string(),
    decimals: zod_1.z.number(),
    network: zod_1.z.nativeEnum(core_1.NetworkName),
    totalSupply: zod_1.z.string().optional(),
    price: zod_1.z
        .object({
        usd: zod_1.z.number().optional(),
        nativeToken: zod_1.z.number().optional(),
    })
        .optional(),
    marketCap: zod_1.z.number().optional(),
    volume24h: zod_1.z.number().optional(),
    priceChange24h: zod_1.z.number().optional(),
    logoURI: zod_1.z.string().optional(),
    verified: zod_1.z.boolean().optional(),
    priceUpdatedAt: zod_1.z.number().optional(),
});
