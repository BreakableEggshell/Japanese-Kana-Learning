export type KanaEntry = {
  char: string;
  answers: string[];
};

export const HIRAGANA: KanaEntry[] = [
  { char: "あ", answers: ["a"] },
  { char: "い", answers: ["i"] },
  { char: "う", answers: ["u"] },
  { char: "え", answers: ["e"] },
  { char: "お", answers: ["o"] },

  { char: "か", answers: ["ka"] },
  { char: "き", answers: ["ki"] },
  { char: "く", answers: ["ku"] },
  { char: "け", answers: ["ke"] },
  { char: "こ", answers: ["ko"] },

  { char: "さ", answers: ["sa"] },
  { char: "し", answers: ["shi", "si"] },
  { char: "す", answers: ["su"] },
  { char: "せ", answers: ["se"] },
  { char: "そ", answers: ["so"] },

  { char: "た", answers: ["ta"] },
  { char: "ち", answers: ["chi", "ti"] },
  { char: "つ", answers: ["tsu", "tu"] },
  { char: "て", answers: ["te"] },
  { char: "と", answers: ["to"] },

  { char: "な", answers: ["na"] },
  { char: "に", answers: ["ni"] },
  { char: "ぬ", answers: ["nu"] },
  { char: "ね", answers: ["ne"] },
  { char: "の", answers: ["no"] },

  { char: "は", answers: ["ha"] },
  { char: "ひ", answers: ["hi"] },
  { char: "ふ", answers: ["fu", "hu"] },
  { char: "へ", answers: ["he"] },
  { char: "ほ", answers: ["ho"] },

  { char: "ま", answers: ["ma"] },
  { char: "み", answers: ["mi"] },
  { char: "む", answers: ["mu"] },
  { char: "め", answers: ["me"] },
  { char: "も", answers: ["mo"] },

  { char: "や", answers: ["ya"] },
  { char: "ゆ", answers: ["yu"] },
  { char: "よ", answers: ["yo"] },

  { char: "ら", answers: ["ra"] },
  { char: "り", answers: ["ri"] },
  { char: "る", answers: ["ru"] },
  { char: "れ", answers: ["re"] },
  { char: "ろ", answers: ["ro"] },

  { char: "わ", answers: ["wa"] },
  { char: "を", answers: ["wo", "o"] },
  { char: "ん", answers: ["n"] },
];

export const KATAKANA: KanaEntry[] = [
  { char: "ア", answers: ["a"] },
  { char: "イ", answers: ["i"] },
  { char: "ウ", answers: ["u"] },
  { char: "エ", answers: ["e"] },
  { char: "オ", answers: ["o"] },

  { char: "カ", answers: ["ka"] },
  { char: "キ", answers: ["ki"] },
  { char: "ク", answers: ["ku"] },
  { char: "ケ", answers: ["ke"] },
  { char: "コ", answers: ["ko"] },

  { char: "サ", answers: ["sa"] },
  { char: "シ", answers: ["shi", "si"] },
  { char: "ス", answers: ["su"] },
  { char: "セ", answers: ["se"] },
  { char: "ソ", answers: ["so"] },

  { char: "タ", answers: ["ta"] },
  { char: "チ", answers: ["chi", "ti"] },
  { char: "ツ", answers: ["tsu", "tu"] },
  { char: "テ", answers: ["te"] },
  { char: "ト", answers: ["to"] },

  { char: "ナ", answers: ["na"] },
  { char: "ニ", answers: ["ni"] },
  { char: "ヌ", answers: ["nu"] },
  { char: "ネ", answers: ["ne"] },
  { char: "ノ", answers: ["no"] },

  { char: "ハ", answers: ["ha"] },
  { char: "ヒ", answers: ["hi"] },
  { char: "フ", answers: ["fu", "hu"] },
  { char: "ヘ", answers: ["he"] },
  { char: "ホ", answers: ["ho"] },

  { char: "マ", answers: ["ma"] },
  { char: "ミ", answers: ["mi"] },
  { char: "ム", answers: ["mu"] },
  { char: "メ", answers: ["me"] },
  { char: "モ", answers: ["mo"] },

  { char: "ヤ", answers: ["ya"] },
  { char: "ユ", answers: ["yu"] },
  { char: "ヨ", answers: ["yo"] },

  { char: "ラ", answers: ["ra"] },
  { char: "リ", answers: ["ri"] },
  { char: "ル", answers: ["ru"] },
  { char: "レ", answers: ["re"] },
  { char: "ロ", answers: ["ro"] },

  { char: "ワ", answers: ["wa"] },
  { char: "ヲ", answers: ["wo", "o"] },
  { char: "ン", answers: ["n"] },
];
