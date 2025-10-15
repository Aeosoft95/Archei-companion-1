export type SuccessLevel = 'Fallimento'|'Parziale'|'Pieno'|'Critico';

export interface RollResult {
  rolled: number[];           // risultati dei d6 (max 5)
  successes: number;          // successi contati
  level: SuccessLevel;        // livello di successo
  threshold: number;          // soglia applicata (2..6)
  poolUsed: number;           // numero di dadi tirati (cap 5)
  poolTheoretical: number;    // pool teorico (influenza la soglia)
}

/**
 * ARCHEI dice system
 * - Cap reale: 5d6
 * - La soglia dipende dal pool teorico:
 *   1–5 => 6+ ; 6–9 => 5+ ; 10–19 => 4+ ; 20+ => 3+
 * - Critico: 5 successi su 5
 * - Override opzionale: forzare soglia 2..6 per richieste GM speciali
 */
export function rollArchei(poolTheoretical: number, overrideThreshold?: number, rng: () => number = Math.random): RollResult {
  const poolUsed = Math.min(5, Math.max(1, Math.floor(poolTheoretical) || 1));
  let threshold: number;
  if (overrideThreshold && overrideThreshold >= 2 && overrideThreshold <= 6) {
    threshold = overrideThreshold;
  } else if (poolTheoretical >= 20) threshold = 3;
  else if (poolTheoretical >= 10) threshold = 4;
  else if (poolTheoretical >= 6) threshold = 5;
  else threshold = 6;

  const rolled: number[] = Array.from({length: poolUsed}, () => 1 + Math.floor(rng() * 6));
  const successes = rolled.filter(v => v >= threshold).length;

  let level: SuccessLevel = 'Fallimento';
  if (successes >= 3) level = 'Critico';
  else if (successes === 2) level = 'Pieno';
  else if (successes === 1) level = 'Parziale';

  // Critico assoluto: 5/5 successi
  if (poolUsed === 5 && successes === 5) level = 'Critico';

  return { rolled, successes, level, threshold, poolUsed, poolTheoretical };
}
