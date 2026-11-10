// Social and Comp ratings (1-10) for real houseguests, by cast collection, as [social, comp].
//
// Comp reflects each houseguest's real competition record (HoH and veto wins, endurance results).
// Social reflects how well they played the house: alliances, how far they got, jury votes, and reputation.
// Values are estimates from each season's history; seasons marked "best guess" are ones with less reliable
// information, rated from personality and how their game was described. Edit freely.
//
// Only the US and Canada collections are offered in the cast picker; their names come from this table.

export type StatPair = [number, number]; // [social, comp]

export const HOUSEGUEST_STATS: { [deck: string]: { [name: string]: StatPair } } = {
    // ---------------- Big Brother US ----------------
    "Big Brother 1": {
        Brittany: [5, 4], Cassandra: [6, 4], Curtis: [5, 4], Eddie: [7, 5], George: [7, 4],
        Jamie: [6, 4], Jordan: [4, 4], Josh: [6, 5], Karen: [4, 4], William: [2, 3],
    },
    "Big Brother 2": {
        Autumn: [3, 3], Bunky: [5, 4], Hardy: [6, 6], Justin: [3, 3], Kent: [4, 4], Krista: [4, 4],
        Mike: [8, 5], Monica: [6, 5], Nicole: [6, 6], Shannon: [3, 5], Sheryl: [3, 3], Will: [10, 4],
    },
    "Big Brother 3": {
        Amy: [6, 5], Chiara: [4, 5], Danielle: [5, 9], Eric: [5, 5], Gerry: [3, 4], Jason: [6, 5],
        Josh: [4, 4], Lisa: [7, 7], Lori: [3, 3], Marcellas: [7, 3], Roddy: [6, 5], Tonya: [3, 3],
    },
    "Big Brother 4": {
        Alison: [6, 7], Amanda: [3, 3], Dana: [3, 4], David: [3, 3], Erika: [6, 5], Jack: [5, 5], Jee: [5, 5],
        Jun: [8, 6], Justin: [4, 6], Michelle: [3, 4], Nathan: [5, 6], Robert: [6, 4], Scott: [2, 4],
    },
    "Big Brother 5": {
        Adria: [6, 5], Cowboy: [7, 4], Diane: [6, 6], Drew: [9, 6], Holly: [4, 4], Jase: [4, 6], Karen: [5, 5],
        Lori: [3, 4], Marvin: [4, 6], Mike: [5, 6], Nakomis: [5, 5], Natalie: [5, 5], Scott: [2, 4], Will: [3, 3],
    },
    "Big Brother 6": {
        April: [5, 5], Ashlea: [4, 4], Beau: [5, 4], Eric: [3, 4], Howie: [6, 5], Ivette: [6, 7], James: [7, 6],
        Janelle: [6, 10], Jennifer: [3, 4], Kaysar: [7, 6], Maggie: [8, 6], Michael: [4, 5], Rachel: [5, 5],
        Sarah: [6, 4],
    },
    "Big Brother 7": {
        Allison: [3, 4], Danielle: [5, 7], Diane: [5, 5], Erika: [7, 5], George: [6, 4], Howie: [5, 5],
        James: [6, 6], Janelle: [6, 10], Jase: [4, 5], Kaysar: [6, 6], Marcellas: [5, 3], Mike: [9, 6],
        Nakomis: [4, 4], Will: [10, 4],
    },
    "Big Brother 8": {
        Amber: [5, 5], Carol: [3, 3], Daniele: [6, 8], Dick: [6, 6], Dustin: [5, 5], Eric: [7, 5], Jameka: [5, 5],
        Jen: [3, 5], Jessica: [6, 5], Joe: [3, 3], Kail: [4, 4], Mike: [3, 4], Nick: [5, 4], Zach: [6, 6],
    },
    "Big Brother 9": {
        Adam: [7, 5], Alex: [3, 4], Allison: [3, 5], Amanda: [3, 4], Chelsia: [5, 5], Jacob: [3, 4], James: [4, 5],
        Jen: [3, 4], Joshua: [4, 6], Matt: [4, 5], Natalie: [4, 6], Neil: [4, 4], Parker: [3, 4], Ryan: [5, 7],
        Sharon: [5, 5], Sheila: [5, 6],
    },
    "Big Brother 10": {
        Angie: [3, 3], April: [5, 6], Brian: [3, 5], Dan: [10, 7], Jerry: [4, 3], Jessie: [4, 6], Keesha: [5, 5],
        Libra: [5, 6], Memphis: [6, 6], Michelle: [4, 6], Ollie: [5, 6], Renny: [6, 3], Steven: [3, 4],
    },
    "Big Brother 11": {
        Braden: [3, 5], Casey: [6, 4], Chima: [3, 5], Jeff: [7, 7], Jesse: [4, 6], Jordan: [8, 5], Kevin: [6, 5],
        Laura: [3, 3], Lydia: [4, 4], Michelle: [4, 7], Natalie: [5, 5], Ronnie: [3, 4], Russell: [4, 8],
    },
    "Big Brother 12": {
        Andrew: [3, 4], Annie: [2, 3], Brendon: [4, 8], Britney: [8, 6], Enzo: [7, 5], Hayden: [8, 7], Kathy: [4, 3],
        Kristen: [3, 5], Lane: [7, 6], Matt: [6, 6], Monet: [3, 4], Rachel: [3, 6], Ragan: [6, 4],
    },
    "Big Brother 13": {
        Adam: [6, 4], Brendon: [4, 7], Cassi: [4, 4], Daniele: [5, 7], Dominic: [5, 5], "Evel Dick": [4, 4],
        Jeff: [6, 7], Jordan: [8, 6], Kalia: [5, 5], Keith: [2, 3], Lawon: [4, 3], Porsche: [5, 6], Rachel: [5, 9],
        Shelly: [6, 4],
    },
    "Big Brother 14": {
        Ashley: [4, 3], Brittany: [7, 5], Danielle: [5, 6], Dan: [10, 6], Frank: [5, 9], Ian: [7, 8], Janelle: [5, 8],
        Jenn: [5, 5], Jodi: [3, 3], Joe: [5, 4], Jojo: [3, 5], Kara: [4, 4], Mike: [7, 4], Shane: [5, 8],
        Willie: [2, 5], Wil: [3, 4],
    },
    "Big Brother 15": {
        Aaryn: [3, 7], Amanda: [6, 4], Andy: [8, 6], Candice: [4, 5], David: [3, 5], Elissa: [5, 6],
        Ginamarie: [3, 4], Helen: [6, 6], Howard: [4, 5], Jeremy: [3, 6], Jessie: [4, 5], Judd: [7, 6],
        Kaitlin: [4, 5], Mccrae: [6, 6], Nick: [5, 6], Spencer: [5, 6],
    },
    "Big Brother 16": {
        Amber: [4, 5], Brittany: [5, 5], Caleb: [4, 7], Christine: [6, 6], Cody: [7, 7], Derrick: [10, 6],
        Devin: [2, 6], Donny: [6, 5], Frankie: [5, 7], Hayden: [5, 6], Jocasta: [4, 3], Joey: [3, 4], Nicole: [5, 6],
        Pao: [3, 4], Victoria: [4, 3], Zach: [6, 5],
    },
    "Big Brother 17": {
        Audrey: [3, 4], Austin: [5, 6], Becky: [4, 5], Clay: [5, 6], Davonne: [4, 5], Jace: [3, 4], Jackie: [5, 6],
        James: [6, 6], Jason: [3, 4], Jeff: [4, 5], "Johnny Mac": [6, 5], Julia: [5, 5], Liz: [6, 6], Meg: [6, 4],
        Shelli: [5, 5], Steve: [6, 8], Vanessa: [7, 8],
    },
    "Big Brother 18": {
        Bridgette: [4, 5], Bronte: [3, 4], Corey: [5, 7], Davonne: [5, 5], Frank: [4, 7], Glenn: [3, 3], James: [6, 5],
        Jozea: [2, 3], Michelle: [4, 6], Natalie: [4, 5], Nicole: [7, 7], Paulie: [3, 6], Paul: [7, 7],
        Tiffany: [4, 5], Victor: [5, 8], Zakiyah: [4, 4],
    },
    "Big Brother 19": {
        Alex: [5, 8], Cameron: [2, 4], Christmas: [6, 5], Cody: [3, 7], Dominique: [4, 4], Elena: [4, 5],
        Jason: [5, 5], Jessica: [4, 5], Jillian: [3, 5], Josh: [6, 6], Kevin: [6, 3], Mark: [4, 5], Matthew: [4, 4],
        Megan: [2, 3], Paul: [8, 7], Ramses: [3, 4], Raven: [4, 3],
    },
    "Big Brother 20": {
        Angela: [5, 7], Bayleigh: [5, 5], Brett: [5, 7], Faysal: [4, 6], Haleigh: [6, 6], JC: [8, 6], Kaitlyn: [5, 6],
        Kaycee: [7, 9], Rachel: [3, 4], Rockstar: [4, 4], Sam: [5, 6], Scottie: [4, 5], Steve: [3, 4],
        "Swaggy C": [5, 5], Tyler: [9, 8], Winston: [4, 5],
    },
    "Big Brother 21": {
        Analyse: [4, 5], Christie: [6, 6], Cliff: [7, 5], David: [3, 4], Holly: [7, 7], Isabella: [4, 4], Jack: [4, 7],
        Jackson: [5, 9], Jessica: [5, 5], Kathryn: [4, 5], Kemi: [2, 3], Nick: [4, 5], Nicole: [6, 7], Ovi: [3, 3],
        Sam: [5, 5], Tommy: [7, 6],
    },
    "Big Brother 22": {
        Bayleigh: [3, 4], Christmas: [6, 5], Cody: [7, 9], Danielle: [5, 5], David: [4, 5], Davonne: [5, 5],
        Enzo: [8, 6], Ian: [4, 5], Janelle: [4, 7], Kayser: [5, 5], Keesha: [3, 3], Kevin: [5, 3], Memphis: [7, 6],
        "Nicole A": [4, 4], "Nicole F": [6, 7], Tyler: [7, 7],
    },
    "Big Brother 23": {
        Alyssa: [5, 6], Azah: [6, 5], Brent: [2, 5], Britini: [4, 4], Christian: [5, 6], Claire: [5, 6],
        "Derek F": [7, 5], "Derek X": [4, 7], Frenchie: [3, 6], Hannah: [7, 5], Kyland: [6, 7], Sarah: [4, 4],
        Tiffany: [9, 6], Travis: [4, 5], Whitney: [4, 4], Xavier: [9, 8],
    },
    "Big Brother 24": {
        Alyssa: [5, 5], Ameerah: [3, 5], Brittany: [6, 6], Daniel: [3, 5], Indy: [4, 4], Jasmine: [3, 4],
        Joseph: [5, 5], Kyle: [5, 6], Michael: [5, 9], Monte: [6, 7], Nicole: [4, 5], Paloma: [3, 3], Pooch: [4, 5],
        Taylor: [9, 6], Terrance: [5, 3], Turner: [6, 7],
    },
    "Big Brother 25": {
        America: [6, 5], Blue: [5, 5], Bowie: [7, 6], Cameron: [4, 7], Cirie: [8, 4], Cory: [4, 5], Felicia: [7, 5],
        Hisam: [3, 4], Izzy: [5, 5], Jag: [7, 9], Jared: [3, 5], Kirsten: [3, 4], Luke: [3, 5], Matt: [6, 5],
        Mecole: [4, 4], Red: [5, 6], Reilly: [3, 5],
    },
    "Big Brother 26": {
        Angela: [4, 7], Brooklyn: [6, 5], Cam: [5, 7], Cedric: [4, 5], Chelsie: [9, 8], Joseph: [4, 5], Kenney: [4, 4],
        Kimo: [4, 5], Leah: [5, 5], Lisa: [3, 4], Makensy: [5, 8], Matt: [3, 5], Quinn: [5, 5], Rubina: [4, 5],
        "T'kor": [5, 5], Tucker: [5, 7],
    },
    // best guess: the most recent season
    "Big Brother 27": {
        Adrian: [3, 4], Amy: [4, 4], Ashley: [8, 6], Ava: [4, 5], Jimmy: [3, 4], Katherine: [4, 5], Keanu: [5, 5],
        Kelley: [5, 6], Lauren: [5, 5], Mickey: [4, 5], Morgan: [6, 7], Rachel: [4, 8], Rylie: [4, 5], Vince: [6, 7],
        Will: [4, 6], Zach: [4, 6], Zae: [3, 4],
    },
    "Big Brother Over The Top": {
        Alex: [4, 5], Cornbread: [5, 4], Danielle: [5, 5], Jason: [6, 5], Justin: [4, 5], Kryssie: [4, 4],
        Monte: [3, 4], Morgan: [7, 5], Neeley: [4, 5], Scott: [3, 5], Shane: [4, 5], Shelby: [5, 6], Whitney: [4, 5],
    },
    "Celebrity Big Brother 1 US": {
        Ariadna: [4, 5], Brandi: [5, 5], Chuck: [3, 4], James: [4, 6], Keshia: [4, 3], Marissa: [8, 5], Mark: [6, 4],
        Metta: [3, 4], Omarosa: [6, 4], Ross: [8, 4], Shannon: [4, 5],
    },
    "Celebrity Big Brother 2 US": {
        Anthony: [3, 3], Dina: [4, 4], Joey: [4, 5], Jonathan: [6, 5], Kandi: [5, 4], Kato: [6, 4], Lolo: [5, 7],
        Natalie: [4, 4], Ricky: [6, 6], Ryan: [5, 6], Tamar: [7, 4], Tom: [5, 5],
    },
    "Celebrity Big Brother 3 US": {
        Carson: [7, 3], "Chris Ka": [4, 4], "Chris Ki": [4, 5], Cynthia: [6, 4], Lamar: [3, 5], Miesha: [7, 7],
        Mirai: [5, 5], Shanna: [4, 5], Teddi: [5, 5], Todd: [6, 4], Todrick: [6, 6],
    },

    // ---------------- Big Brother Canada ----------------
    "Big Brother Canada 1": {
        AJ: [5, 5], Alec: [7, 5], Andrew: [5, 4], Aneal: [3, 4], Danielle: [4, 5], Emmett: [5, 7], Gary: [6, 4],
        Jillian: [6, 5], Kat: [3, 4], Liza: [3, 4], Peter: [4, 5], Suzette: [4, 4], Talla: [6, 4], Tom: [3, 4],
        Topaz: [5, 6],
    },
    "Big Brother Canada 2": {
        Adel: [4, 5], Allison: [4, 4], Andrew: [4, 5], Anick: [3, 3], Arlie: [4, 5], Heather: [3, 4], Ika: [3, 4],
        Jon: [6, 7], Kenny: [6, 5], Kyle: [3, 5], Neda: [6, 5], Paul: [3, 4], Rachelle: [3, 4], Sabrina: [6, 6],
        Sarah: [5, 6],
    },
    "Big Brother Canada 3": {
        Ashleigh: [5, 5], Bobby: [4, 5], Brittnee: [6, 7], Bruno: [5, 5], Godfrey: [5, 5], Graig: [3, 4], Johnny: [4, 4],
        Jordan: [3, 4], Kevin: [4, 5], Naeha: [3, 4], Pilar: [5, 5], Risha: [2, 3], Sarah: [7, 6], Sindy: [3, 4],
        Willow: [4, 5], Zach: [6, 6],
    },
    "Big Brother Canada 4": {
        Cassandra: [4, 4], Christine: [4, 4], Dallas: [4, 5], Jared: [4, 5], Joel: [6, 6], Kelsey: [5, 6],
        Loveita: [4, 5], Maddy: [4, 5], Mitch: [4, 6], "Nick & Phil": [7, 7], Nikki: [3, 4], Paige: [3, 4],
        Ramsey: [3, 4], Raul: [5, 5], Sharry: [3, 4], Tim: [5, 6],
    },
    "Big Brother Canada 5": {
        Bruno: [5, 5], Cassandra: [4, 4], Dallas: [4, 5], Demetres: [5, 6], Dillon: [3, 4], Dre: [6, 5], Emily: [3, 4],
        Gary: [4, 3], Ika: [4, 5], Jackie: [4, 5], Karen: [4, 5], Kevin: [9, 4], Mark: [5, 6], Neda: [6, 5],
        Sindy: [5, 5], William: [3, 4],
    },
    "Big Brother Canada 6": {
        Alejandra: [4, 4], Andrew: [3, 4], Derek: [5, 5], Erica: [5, 5], Hamza: [4, 5], Jesse: [4, 6], Johnny: [3, 4],
        Kaela: [6, 7], Maddy: [4, 5], Merron: [4, 4], Olivia: [4, 6], Paras: [7, 6], Rozina: [4, 5], Ryan: [3, 4],
        Veronica: [3, 4], William: [4, 5],
    },
    "Big Brother Canada 7": {
        Adam: [5, 6], Anthony: [6, 7], Chelsea: [5, 5], Cory: [4, 6], Damien: [4, 5], Dane: [4, 5], Eddie: [3, 4],
        Estefania: [4, 4], Kailyn: [6, 6], Kiera: [4, 5], Kyra: [4, 5], Laura: [4, 5], Maki: [3, 4], Mark: [5, 6],
        Samantha: [3, 4],
    },
    // best guess: this season was cut short before a winner was crowned
    "Big Brother Canada 8": {
        Angie: [3, 4], Brooke: [4, 5], Carol: [4, 4], Chris: [5, 6], Hira: [4, 5], Jamar: [4, 5], "John Luke": [4, 5],
        Kyle: [5, 5], Madeline: [5, 6], Micheal: [3, 4], "Minh-Ly": [4, 4], Nico: [4, 5], Rianne: [4, 5],
        Sheldon: [3, 4], Susanne: [5, 4], Vanessa: [3, 4],
    },
    "Big Brother Canada 9": {
        Austin: [3, 4], Beth: [3, 4], Breydon: [4, 6], Jedson: [4, 5], Josh: [4, 5], Julie: [3, 4], Kiefer: [3, 4],
        Kyle: [6, 6], Latoya: [4, 5], Rohan: [5, 6], Tera: [3, 4], Tina: [4, 4], Tychon: [7, 7], Victoria: [5, 5],
    },
    "Big Brother Canada 10": {
        Betty: [6, 5], Gino: [5, 5], Haleena: [5, 5], Hermon: [4, 5], "Jacey Lynne": [4, 5], Jay: [3, 4], Jess: [3, 4],
        Josh: [6, 6], Kevin: [7, 5], Kyle: [5, 7], Marty: [4, 4], Melina: [4, 5], Moose: [6, 5], Stephanie: [3, 4],
        Summer: [4, 5], Tynesha: [4, 5],
    },
    // best guess
    "Big Brother Canada 11": {
        Amal: [3, 4], Anika: [5, 5], Claudia: [4, 5], Daniel: [4, 5], Dan: [4, 4], Hope: [4, 4], "John Michael": [4, 5],
        Jonathan: [3, 4], Kuzie: [5, 5], Renee: [6, 6], Roberto: [3, 4], Santina: [4, 5], Shanaya: [3, 4], Ty: [5, 6],
        Vanessa: [4, 5], Zach: [5, 6],
    },
    // best guess
    "Big Brother Canada 12": {
        Anthony: [5, 5], Avery: [5, 6], Bayleigh: [4, 5], Dinis: [4, 5], Donna: [5, 4], Elijah: [5, 6], Janine: [5, 5],
        Kayla: [4, 5], Lexus: [4, 5], Matthew: [4, 5], Todd: [4, 4], Tola: [5, 5], Victoria: [4, 5], Vivek: [5, 5],
    },
};

export const ALLOWED_DECKS = new Set(Object.keys(HOUSEGUEST_STATS));

// Looks up a houseguest's ratings. Returns nothing for unknown people (e.g. uploaded photos).
export function lookupStats(deck: string, name: string): { social?: number; comp?: number } {
    const entry = HOUSEGUEST_STATS[deck] && HOUSEGUEST_STATS[deck][name];
    return entry ? { social: entry[0], comp: entry[1] } : {};
}
