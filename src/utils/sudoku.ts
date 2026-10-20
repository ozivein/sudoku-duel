import { CellData } from '../types/game';

// Generates a valid full 9x9 Sudoku solution matrix using automorphism transforms
export function generateSolvedSudoku(): number[][] {
  // Canonical valid Sudoku base
  const base: number[][] = [];
  for (let r = 0; r < 9; r++) {
    const row: number[] = [];
    for (let c = 0; c < 9; c++) {
      row.push(((r * 3 + Math.floor(r / 3) + c) % 9) + 1);
    }
    base.push(row);
  }

  // 1. Permute digits (1-9 shuffle)
  const digits = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  for (let i = digits.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [digits[i], digits[j]] = [digits[j], digits[i]];
  }
  const digitMap = new Map<number, number>();
  for (let i = 0; i < 9; i++) {
    digitMap.set(i + 1, digits[i]);
  }

  let grid = base.map(row => row.map(val => digitMap.get(val)!));

  // 2. Permute rows within each band (0-2, 3-5, 6-8)
  for (let band = 0; band < 3; band++) {
    const rIndices = [band * 3, band * 3 + 1, band * 3 + 2];
    // Shuffle indices
    for (let i = rIndices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [rIndices[i], rIndices[j]] = [rIndices[j], rIndices[i]];
    }
    const bandRows = [grid[rIndices[0]], grid[rIndices[1]], grid[rIndices[2]]];
    grid[band * 3] = bandRows[0];
    grid[band * 3 + 1] = bandRows[1];
    grid[band * 3 + 2] = bandRows[2];
  }

  // 3. Permute columns within each stack (0-2, 3-5, 6-8)
  for (let stack = 0; stack < 3; stack++) {
    const cIndices = [stack * 3, stack * 3 + 1, stack * 3 + 2];
    for (let i = cIndices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [cIndices[i], cIndices[j]] = [cIndices[j], cIndices[i]];
    }
    for (let r = 0; r < 9; r++) {
      const v0 = grid[r][cIndices[0]];
      const v1 = grid[r][cIndices[1]];
      const v2 = grid[r][cIndices[2]];
      grid[r][stack * 3] = v0;
      grid[r][stack * 3 + 1] = v1;
      grid[r][stack * 3 + 2] = v2;
    }
  }

  // 4. Permute row bands
  const bands = [0, 1, 2];
  for (let i = bands.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [bands[i], bands[j]] = [bands[j], bands[i]];
  }
  const reorderedRows: number[][] = [];
  for (const b of bands) {
    reorderedRows.push(grid[b * 3], grid[b * 3 + 1], grid[b * 3 + 2]);
  }
  grid = reorderedRows;

  // 5. Random transposition (transpose with 50% probability)
  if (Math.random() > 0.5) {
    const transposed: number[][] = Array.from({ length: 9 }, () => Array(9).fill(0));
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        transposed[c][r] = grid[r][c];
      }
    }
    grid = transposed;
  }

  return grid;
}

// Calculate 3x3 block index (0 to 8) from row and col
export function getBlockIndex(row: number, col: number): number {
  return Math.floor(row / 3) * 3 + Math.floor(col / 3);
}

// Create initial duel board with balanced givens per 3x3 block
export function generateDuelBoard(): CellData[] {
  const solved = generateSolvedSudoku();
  const cells: CellData[] = [];

  // For each 3x3 block, randomly reveal 3 or 4 cells (leaving 5-6 empty per block)
  // Total givens: around 32-34 cells, leaving 47-49 contested cells for the duel.
  const revealedSet = new Set<string>();

  for (let blockRow = 0; blockRow < 3; blockRow++) {
    for (let blockCol = 0; blockCol < 3; blockCol++) {
      const blockCells: { r: number; c: number }[] = [];
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
          blockCells.push({ r: blockRow * 3 + r, c: blockCol * 3 + c });
        }
      }
      // Shuffle block cells
      for (let i = blockCells.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [blockCells[i], blockCells[j]] = [blockCells[j], blockCells[i]];
      }

      // Keep 3 to 4 cells as given
      const numGivens = Math.random() < 0.5 ? 3 : 4;
      for (let i = 0; i < numGivens; i++) {
        revealedSet.add(`${blockCells[i].r}-${blockCells[i].c}`);
      }
    }
  }

  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const isInitial = revealedSet.has(`${r}-${c}`);
      const solution = solved[r][c];
      const block = getBlockIndex(r, c);

      cells.push({
        id: `${r}-${c}`,
        row: r,
        col: c,
        block,
        solution,
        initial: isInitial,
        value: isInitial ? solution : null,
        claimedBy: null,
      });
    }
  }

  return cells;
}

// Check if move is valid for the deterministic solution
export function isMoveCorrect(cell: CellData, chosenNumber: number): boolean {
  return cell.solution === chosenNumber;
}

// Calculate score for combo
// 1st correct = 10, 2nd = 15, 3rd = 20, 4th = 25, etc.
export function calculateMoveScore(currentCombo: number): number {
  // currentCombo is the NEW combo value (e.g. 1 on first correct move)
  return 10 + Math.max(0, currentCombo - 1) * 5;
}

// Compute valid candidate digits (1-9) for an empty cell using standard Sudoku rules
// (checks visible numbers in the same row, column, and 3x3 block; never reveals hidden solution)
export function getValidSudokuCandidates(cells: CellData[], targetCell: CellData): number[] {
  if (targetCell.initial || targetCell.claimedBy !== null || targetCell.value !== null) {
    return [];
  }

  const usedNumbers = new Set<number>();

  for (const c of cells) {
    if (c.id === targetCell.id || c.value === null) continue;
    if (
      c.row === targetCell.row ||
      c.col === targetCell.col ||
      c.block === targetCell.block
    ) {
      usedNumbers.add(c.value);
    }
  }

  const candidates: number[] = [];
  for (let d = 1; d <= 9; d++) {
    if (!usedNumbers.has(d)) {
      candidates.push(d);
    }
  }

  return candidates;
}

