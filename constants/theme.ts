// Islamic-themed color palette

export const Palette = {
  gold:       '#C8A96E',
  goldLight:  '#D4B87A',
  goldDim:    'rgba(200,169,110,0.30)',
  green:      '#1B4332',
  greenLight: '#2D6A4F',
  cream:      '#FAF7F2',
} as const;

export const Dark = {
  bg:          '#080808',
  card:        '#0F0F0F',
  cardAlt:     '#141414',
  text:        '#ECE6DB',
  textMuted:   '#8C8478',
  border:      'rgba(255,255,255,0.07)',
  tabBar:      '#0A0A0A',
  tabInactive: '#4A4540',
};

export const Light = {
  bg:          '#FAF7F2',
  card:        '#FFFFFF',
  cardAlt:     '#F5F1EB',
  text:        '#1C1A17',
  textMuted:   '#8A7F72',
  border:      'rgba(0,0,0,0.08)',
  tabBar:      '#FFFFFF',
  tabInactive: '#B0A898',
};

export type ThemeColors = {
  bg:          string;
  card:        string;
  cardAlt:     string;
  text:        string;
  textMuted:   string;
  border:      string;
  tabBar:      string;
  tabInactive: string;
};
