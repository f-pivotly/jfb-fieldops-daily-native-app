// Source of truth: JFB_Standard_Delay_Codes.xlsx, "Reserved Slots" sheet.
// Each work-type group owns a 100-number block (Hydraulic Dredging 0-99,
// Mechanical Dredging 100-199, Hydraulic Capping 200-299, Mechanical
// Capping 300-399). These are the numbers within each block deliberately
// left open in the company master list for project-specific custom codes
// -- using them keeps a project's own codes from colliding with numbers
// the shared company library might claim later.
export const RESERVED_CODE_SLOTS = {
  "Hydraulic Dredging": [
    6, 7, 8, 9, 35, 36, 37, 38, 39, 44, 45, 46, 47, 48, 49, 59, 70, 71, 72,
    73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 96,
    97, 98, 99,
  ],
  "Mechanical Dredging": [
    106, 107, 108, 109, 121, 122, 124, 127, 134, 135, 136, 137, 138, 139,
    144, 145, 146, 147, 148, 149, 156, 157, 158, 159, 175, 176, 177, 178,
    179, 180, 181, 182, 183, 184, 185, 186, 187, 188, 189, 195, 196, 197,
    198, 199,
  ],
  "Hydraulic Capping": [
    206, 207, 208, 209, 210, 211, 212, 213, 214, 215, 216, 217, 218, 219,
    238, 239, 244, 245, 246, 247, 248, 249, 256, 257, 258, 259, 269, 270,
    271, 272, 273, 274, 275, 276, 277, 278, 279, 280, 281, 282, 283, 284,
    285, 286, 287, 288, 289, 295, 296, 297, 298, 299,
  ],
  "Mechanical Capping": [
    306, 307, 308, 309, 310, 320, 321, 322, 324, 327, 331, 332, 333, 334,
    335, 336, 337, 338, 339, 344, 345, 346, 347, 348, 349, 356, 357, 358,
    359, 369, 378, 379, 380, 381, 382, 383, 384, 385, 386, 387, 388, 389,
    395, 396, 397, 398, 399,
  ],
};

// Returns the lowest reserved number for workTypeName not already present
// in usedCodeNums (a Set of numbers), or null if that group's whole
// reserved range is already taken -- callers must not fall back to an
// arbitrary number in that case.
export function nextReservedCodeNum(workTypeName, usedCodeNums) {
  const pool = RESERVED_CODE_SLOTS[workTypeName] ?? [];
  return pool.find((n) => !usedCodeNums.has(n)) ?? null;
}
