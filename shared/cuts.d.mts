export interface Cut {
  corte: number;
  titulo_hook: string;
  segundos_inicio: number;
  segundos_fim: number;
  url_youtube: string;
}
export function parseCuts(input: unknown, fallbackUrl?: string): Cut[];
export function filenameForCut(cut: Cut): string;
