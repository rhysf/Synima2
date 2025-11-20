use crate::logger::Logger;
use std::collections::{HashMap}; // , HashSet

pub fn reverse_complement(seq: &str) -> String {
    seq.chars()
        .rev()
        .map(|c| match c {
            'A' => 'T',
            'T' => 'A',
            'G' => 'C',
            'C' => 'G',
            _ => 'N',
        })
        .collect()
}

pub fn translate_dna_to_peptide(dna: &str, id: &str, genetic_code: usize, logger: &Logger) -> String {

    if dna.len() % 3 != 0 {
        logger.warning(&format!("extract_alignment_from_gff: CDS for '{}' has length {} not divisible by 3", id, dna.len()));
    }

    let code = get_genetic_code(genetic_code);
    let mut pep = String::new();
    let chars: Vec<char> = dna.to_uppercase().chars().collect();

    for codon_start in (0..chars.len()).step_by(3) {
        if codon_start + 3 > chars.len() {
            break;
        }

        let codon: String = chars[codon_start..codon_start + 3].iter().collect();
        let aa = code.get(&codon[..]).copied().unwrap_or('X');
        pep.push(aa);
    }
    pep
}

fn get_genetic_code(code_id: usize) -> HashMap<&'static str, char> {
    match code_id {
        2 => vertebrate_mito_code(),
        3 => yeast_mito_code(),
        4 => mold_protozoan_code(),
        5 => invertebrate_mito_code(),
        6 => ciliate_nuclear_code(),
        9 => echinoderm_code(),
        10 => euplotid_code(),
        11 => bacterial_code(),
        12 => alt_yeast_code(),
        _ => standard_code(),
    }
}

fn standard_code() -> HashMap<&'static str, char> {
    HashMap::from([
        ("TTT", 'F'), ("TTC", 'F'), ("TTA", 'L'), ("TTG", 'L'),
        ("CTT", 'L'), ("CTC", 'L'), ("CTA", 'L'), ("CTG", 'L'),
        ("ATT", 'I'), ("ATC", 'I'), ("ATA", 'I'), ("ATG", 'M'),
        ("GTT", 'V'), ("GTC", 'V'), ("GTA", 'V'), ("GTG", 'V'),
        ("TCT", 'S'), ("TCC", 'S'), ("TCA", 'S'), ("TCG", 'S'),
        ("AGT", 'S'), ("AGC", 'S'),
        ("CCT", 'P'), ("CCC", 'P'), ("CCA", 'P'), ("CCG", 'P'),
        ("ACT", 'T'), ("ACC", 'T'), ("ACA", 'T'), ("ACG", 'T'),
        ("GCT", 'A'), ("GCC", 'A'), ("GCA", 'A'), ("GCG", 'A'),
        ("TAT", 'Y'), ("TAC", 'Y'), ("TAA", '*'), ("TAG", '*'), ("TGA", '*'),
        ("CAT", 'H'), ("CAC", 'H'), ("CAA", 'Q'), ("CAG", 'Q'),
        ("AAT", 'N'), ("AAC", 'N'), ("AAA", 'K'), ("AAG", 'K'),
        ("GAT", 'D'), ("GAC", 'D'), ("GAA", 'E'), ("GAG", 'E'),
        ("TGT", 'C'), ("TGC", 'C'), ("TGG", 'W'),
        ("CGT", 'R'), ("CGC", 'R'), ("CGA", 'R'), ("CGG", 'R'),
        ("AGA", 'R'), ("AGG", 'R'),
        ("GGT", 'G'), ("GGC", 'G'), ("GGA", 'G'), ("GGG", 'G'),
    ])
}

fn vertebrate_mito_code() -> HashMap<&'static str, char> {
    let mut code = standard_code();
    code.insert("AGA", '*');
    code.insert("AGG", '*');
    code.insert("ATA", 'M');
    code.insert("TGA", 'W');
    code
}

fn yeast_mito_code() -> HashMap<&'static str, char> {
    let mut code = standard_code();
    code.insert("ATA", 'M');
    code.insert("CTT", 'T');
    code.insert("CTC", 'T');
    code.insert("CTA", 'T');
    code.insert("CTG", 'T');
    code.insert("TGA", 'W');
    code
}

fn mold_protozoan_code() -> HashMap<&'static str, char> {
    let mut code = standard_code();
    code.insert("TGA", 'W');
    code
}

fn invertebrate_mito_code() -> HashMap<&'static str, char> {
    let mut code = standard_code();
    code.insert("AGA", 'S');
    code.insert("AGG", 'S');
    code.insert("ATA", 'M');
    code.insert("TGA", 'W');
    code
}

fn ciliate_nuclear_code() -> HashMap<&'static str, char> {
    let mut code = standard_code();
    code.insert("TAA", 'Q');
    code.insert("TAG", 'Q');
    code
}

fn echinoderm_code() -> HashMap<&'static str, char> {
    let mut code = standard_code();
    code.insert("AAA", 'N');
    code.insert("AGA", 'S');
    code.insert("AGG", 'S');
    code.insert("TGA", 'W');
    code
}

fn euplotid_code() -> HashMap<&'static str, char> {
    let mut code = standard_code();
    code.insert("TGA", 'C');
    code
}

fn bacterial_code() -> HashMap<&'static str, char> {
    let mut code = standard_code();
    code.insert("TGA", 'W');
    code
}

fn alt_yeast_code() -> HashMap<&'static str, char> {
    let mut code = standard_code();
    code.insert("CTG", 'S');
    code
}