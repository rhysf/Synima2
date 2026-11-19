//! Sequence identity for DAGchainer synteny in Synima.html.
//!
//! DAGchainer is given dummy E-values (see dagchainer.rs), so no identity reaches
//! its output. Instead, each ortholog pair that DAGchainer placed in a chain is
//! looked up in the Step 2 all-vs-all tables of its genome pair: the row with the
//! highest bitscore, in either direction, gives the pair its % identity and
//! alignment length. Each chain (one block in the contig view) then gets the
//! mean identity of its pairs, weighted by alignment length.

use crate::logger::Logger;
use serde::Serialize;
use std::collections::{BTreeSet, HashMap};
use std::fs::File;
use std::io::{BufRead, BufReader, ErrorKind};
use std::path::Path;

/// One gene pair from a MATCHES line of the aligncoords file.
#[derive(Debug, Clone, PartialEq)]
pub struct AlignedPair {
    pub genome_a: String,
    pub gene_a: String,
    pub genome_b: String,
    pub gene_b: String,
}

/// One DAGchainer chain: an "## alignment ..." header and the pairs under it.
#[derive(Debug, Clone, PartialEq)]
pub struct Chain {
    /// The fields dagchainer_to_chain_spans.pl prints for this chain:
    /// accA, lendA-rendA, accB, lendB-rendB, orientation, number of pairs.
    pub span_key: String,
    /// dagchainer_to_chain_spans.pl drops these chains from the spans file.
    pub local_inversion: bool,
    /// Indices into `ParsedAligncoords::pairs`.
    pub pair_indices: Vec<usize>,
}

#[derive(Debug, Default)]
pub struct ParsedAligncoords {
    /// In file order: index i is the i-th MATCHES line.
    pub pairs: Vec<AlignedPair>,
    pub chains: Vec<Chain>,
}

/// Best all-vs-all row for one gene pair.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct BestHit {
    pub pident: f64,
    pub aln_len: u64,
    pub bitscore: f64,
}

impl BestHit {
    /// Highest bitscore wins; ties go to the longer alignment, then to the higher identity,
    /// so the result does not depend on which direction's table is read first.
    fn beats(&self, other: &BestHit) -> bool {
        (self.bitscore, self.aln_len, self.pident) > (other.bitscore, other.aln_len, other.pident)
    }
}

/// Serialised as `[identity or null, gene pairs in block, pairs with an identity]`.
#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
pub struct SpanIdentity(pub Option<f64>, pub usize, pub usize);

/// Embedded in Synima.html as `data-synteny.identity`.
#[derive(Debug, Serialize)]
pub struct SyntenyIdentity {
    /// "pep" (protein identity) or "cds" (nucleotide identity).
    pub alignment_type: String,
    /// One entry per non-empty line of the embedded aligncoords.spans text.
    pub span_identity: Vec<Option<SpanIdentity>>,
    /// One entry per MATCHES line of the embedded aligncoords text (% identity or null).
    /// Left out when the aligncoords text itself is not embedded.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pair_identity: Option<Vec<Option<f64>>>,
}

/// gene (lexically smaller ID) -> partner gene -> best row seen so far.
type HitTable = HashMap<String, HashMap<String, Option<BestHit>>>;

fn ordered<'a>(a: &'a str, b: &'a str) -> (&'a str, &'a str) {
    if a <= b {
        (a, b)
    } else {
        (b, a)
    }
}

fn round2(x: f64) -> f64 {
    (x * 100.0).round() / 100.0
}

/// Chain being read: header fields plus running coordinate extents.
struct OpenChain {
    acc_a: String,
    acc_b: String,
    orient: char,
    local_inversion: bool,
    a_range: Option<(i64, i64)>,
    b_range: Option<(i64, i64)>,
    pair_indices: Vec<usize>,
}

fn widen(range: &mut Option<(i64, i64)>, values: [Option<i64>; 2]) {
    for v in values.into_iter().flatten() {
        *range = Some(match *range {
            Some((lo, hi)) => (lo.min(v), hi.max(v)),
            None => (v, v),
        });
    }
}

fn close_chain(open: OpenChain) -> Chain {
    let fmt = |r: Option<(i64, i64)>| r.map(|(lo, hi)| format!("{lo}-{hi}")).unwrap_or_default();
    Chain {
        span_key: format!(
            "{}\t{}\t{}\t{}\t{}\t{}",
            open.acc_a,
            fmt(open.a_range),
            open.acc_b,
            fmt(open.b_range),
            open.orient,
            open.pair_indices.len()
        ),
        local_inversion: open.local_inversion,
        pair_indices: open.pair_indices,
    }
}

/// Parse a (concatenated) DAGchainer aligncoords file.
///
/// Chain headers follow dagchainer_to_chain_spans.pl: any line starting with '#',
/// accA/accB are whitespace fields 2 and 4, "(reverse)" means '-' orientation.
/// Pair lines follow parseAligncoordsText() in synteny.js: trimmed, not '#', with a
/// MATCHES field, so pair index i here is MATCHES line i there.
pub fn parse_aligncoords<R: BufRead>(reader: R) -> std::io::Result<ParsedAligncoords> {
    let mut parsed = ParsedAligncoords::default();
    let mut open: Option<OpenChain> = None;

    for line in reader.lines() {
        let line = line?;

        if line.starts_with('#') {
            if let Some(done) = open.take() {
                parsed.chains.push(close_chain(done));
            }
            let x: Vec<&str> = line.split_whitespace().collect();
            open = Some(OpenChain {
                acc_a: x.get(2).unwrap_or(&"").to_string(),
                acc_b: x.get(4).unwrap_or(&"").to_string(),
                orient: if line.contains("(reverse)") { '-' } else { '+' },
                local_inversion: line.contains("local inversion"),
                a_range: None,
                b_range: None,
                pair_indices: Vec::new(),
            });
            continue;
        }

        let t = line.trim();
        if t.is_empty() || t.starts_with('#') {
            continue;
        }
        let cols: Vec<&str> = t.split('\t').collect();
        let Some(mi) = cols.iter().position(|c| *c == "MATCHES") else {
            continue;
        };

        let col = |i: usize| cols.get(i).copied().unwrap_or("");
        let num = |i: usize| col(i).parse::<i64>().ok();

        let idx = parsed.pairs.len();
        parsed.pairs.push(AlignedPair {
            genome_a: col(0).to_string(),
            gene_a: col(2).to_string(),
            genome_b: col(mi + 1).to_string(),
            gene_b: col(mi + 3).to_string(),
        });

        if let Some(chain) = open.as_mut() {
            widen(&mut chain.a_range, [num(3), num(4)]);
            widen(&mut chain.b_range, [num(mi + 4), num(mi + 5)]);
            chain.pair_indices.push(idx);
        }
    }

    if let Some(done) = open.take() {
        parsed.chains.push(close_chain(done));
    }
    Ok(parsed)
}

/// Scan one tabular BLAST/DIAMOND file (-outfmt 6 / -f 6 / -m 8) and keep the best
/// row for each wanted pair, whichever way round the query and subject are.
/// Returns the number of malformed rows that were skipped.
fn scan_tabular_hits<R: BufRead>(reader: R, wanted: &mut HitTable) -> std::io::Result<usize> {
    let mut malformed = 0usize;

    let mut reader = reader;
    let mut line = String::new();
    loop {
        line.clear();
        if reader.read_line(&mut line)? == 0 {
            break;
        }
        let line = line.trim_end_matches(['\r', '\n']);
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        let mut cols = line.split('\t');
        let (Some(query), Some(subject)) = (cols.next(), cols.next()) else {
            malformed += 1;
            continue;
        };

        let (lo, hi) = ordered(query, subject);
        let (Some(pident), Some(aln_len), Some(bitscore)) = (cols.next(), cols.next(), cols.nth(7))
        else {
            malformed += 1;
            continue;
        };
        let Some(slot) = wanted.get_mut(lo).and_then(|m| m.get_mut(hi)) else {
            continue;
        };

        let (Ok(pident), Ok(aln_len), Ok(bitscore)) = (
            pident.trim().parse::<f64>(),
            aln_len.trim().parse::<u64>(),
            bitscore.trim().parse::<f64>(),
        ) else {
            malformed += 1;
            continue;
        };
        if !(0.0..=100.0).contains(&pident) || aln_len == 0 || !bitscore.is_finite() {
            malformed += 1;
            continue;
        }

        let hit = BestHit {
            pident,
            aln_len,
            bitscore,
        };
        match slot {
            Some(best) if !hit.beats(best) => {}
            _ => *slot = Some(hit),
        }
    }
    Ok(malformed)
}

/// Best all-vs-all hit for each pair (None if neither direction has one).
/// Reads `<A>_vs_<B>.out` and `<B>_vs_<A>.out` from the Step 2 directory for every
/// genome pair that appears in `pairs`.
pub fn best_hits_for_pairs(
    pairs: &[AlignedPair],
    blast_dir: &Path,
    logger: &Logger,
) -> Vec<Option<BestHit>> {
    let mut wanted: HitTable = HashMap::new();
    let mut genome_pairs: BTreeSet<(String, String)> = BTreeSet::new();

    for p in pairs {
        let (lo, hi) = ordered(&p.gene_a, &p.gene_b);
        wanted
            .entry(lo.to_string())
            .or_default()
            .insert(hi.to_string(), None);
        let (ga, gb) = ordered(&p.genome_a, &p.genome_b);
        genome_pairs.insert((ga.to_string(), gb.to_string()));
    }

    for (ga, gb) in &genome_pairs {
        let mut files = vec![blast_dir.join(format!("{ga}_vs_{gb}.out"))];
        if ga != gb {
            files.push(blast_dir.join(format!("{gb}_vs_{ga}.out")));
        }
        for path in files {
            let reader = match File::open(&path) {
                Ok(file) => BufReader::new(file),
                Err(e) => {
                    logger.warning(&format!(
                        "synteny_identity: cannot open {}: {}",
                        path.display(),
                        e
                    ));
                    continue;
                }
            };
            match scan_tabular_hits(reader, &mut wanted) {
                Ok(0) => {}
                Ok(n) => logger.warning(&format!(
                    "synteny_identity: skipped {} malformed row(s) in {}",
                    n,
                    path.display()
                )),
                Err(e) => logger.warning(&format!(
                    "synteny_identity: error reading {}: {}",
                    path.display(),
                    e
                )),
            }
        }
    }

    pairs
        .iter()
        .map(|p| {
            let (lo, hi) = ordered(&p.gene_a, &p.gene_b);
            wanted.get(lo).and_then(|m| m.get(hi)).copied().flatten()
        })
        .collect()
}

/// Alignment-length-weighted identity per chain, keyed by span key.
fn chain_identities(
    chains: &[Chain],
    hits: &[Option<BestHit>],
) -> HashMap<String, Vec<SpanIdentity>> {
    let mut by_key: HashMap<String, Vec<SpanIdentity>> = HashMap::new();
    for chain in chains.iter().filter(|c| !c.local_inversion) {
        let mut weighted = 0.0;
        let mut len = 0.0;
        let mut with_hit = 0;
        for &i in &chain.pair_indices {
            if let Some(Some(hit)) = hits.get(i) {
                with_hit += 1;
                weighted += hit.pident * hit.aln_len as f64;
                len += hit.aln_len as f64;
            }
        }
        let identity = (len > 0.0).then(|| round2(weighted / len));
        by_key
            .entry(chain.span_key.clone())
            .or_default()
            .push(SpanIdentity(identity, chain.pair_indices.len(), with_hit));
    }
    by_key
}

/// Key of one aligncoords.spans line, in the same form as `Chain::span_key`.
fn span_line_key(trimmed: &str) -> Option<String> {
    let cols: Vec<&str> = trimmed.split('\t').collect();
    if cols.len() < 8 {
        return None;
    }
    Some(format!(
        "{}\t{}\t{}\t{}\t{}\t{}",
        cols[0], cols[1], cols[3], cols[4], cols[6], cols[7]
    ))
}

/// One entry per non-empty spans line (the lines parseAligncoordsSpansText() reads).
fn span_identities(
    spans_text: &str,
    mut by_key: HashMap<String, Vec<SpanIdentity>>,
) -> Vec<Option<SpanIdentity>> {
    spans_text
        .lines()
        .map(str::trim)
        .filter(|t| !t.is_empty())
        // The spans script reverses a stable sort by pair count, so ties are in reverse file order.
        .map(|t| span_line_key(t).and_then(|k| by_key.get_mut(&k)?.pop()))
        .collect()
}

/// Compute everything Synima.html needs for colouring by identity.
/// Returns None (with a warning) when the inputs are missing.
pub fn compute_synteny_identity(
    aligncoords_path: &Path,
    spans_text: &str,
    blast_dir: &Path,
    alignment_type: &str,
    include_pair_identity: bool,
    logger: &Logger,
) -> Option<SyntenyIdentity> {
    if !blast_dir.is_dir() {
        logger.warning(&format!("synteny_identity: all-vs-all directory {} not found; run the align-all step first. Synteny identity not added.", blast_dir.display()));
        return None;
    }

    let parsed = match File::open(aligncoords_path)
        .and_then(|file| parse_aligncoords(BufReader::new(file)))
    {
        Ok(p) => p,
        Err(e) if e.kind() == ErrorKind::NotFound => {
            logger.warning(&format!("synteny_identity: {} not found; run the dagchainer step first. Synteny identity not added.", aligncoords_path.display()));
            return None;
        }
        Err(e) => {
            logger.warning(&format!(
                "synteny_identity: error reading {}: {}. Synteny identity not added.",
                aligncoords_path.display(),
                e
            ));
            return None;
        }
    };

    let hits = best_hits_for_pairs(&parsed.pairs, blast_dir, logger);
    let with_hit = hits.iter().filter(|h| h.is_some()).count();
    logger.information(&format!(
        "synteny_identity: {} of {} DAGchainer gene pairs have a usable all-vs-all hit",
        with_hit,
        parsed.pairs.len()
    ));

    let by_key = chain_identities(&parsed.chains, &hits);
    let span_identity = span_identities(spans_text, by_key);
    let unmatched = span_identity.iter().filter(|s| s.is_none()).count();
    if unmatched > 0 {
        logger.warning(&format!(
            "synteny_identity: {} of {} spans lines did not match a DAGchainer chain",
            unmatched,
            span_identity.len()
        ));
    }
    let blocks_with_identity = span_identity
        .iter()
        .filter(|s| matches!(s, Some(SpanIdentity(Some(_), _, _))))
        .count();
    logger.information(&format!(
        "synteny_identity: identity for {} of {} synteny blocks",
        blocks_with_identity,
        span_identity.len()
    ));
    if blocks_with_identity == 0 && (!include_pair_identity || with_hit == 0) {
        return None;
    }

    let pair_identity =
        include_pair_identity.then(|| hits.iter().map(|h| h.map(|b| round2(b.pident))).collect());

    Some(SyntenyIdentity {
        alignment_type: alignment_type.to_string(),
        span_identity,
        pair_identity,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    // Two chains in the real DAGchainer layout: a forward chain with two pairs and
    // a reverse chain with one pair (end5 > end3), separated by a local inversion.
    const ALIGNCOORDS: &str = "\
## alignment A;c1 vs. B;c9 Alignment #1  score = 9.0 (num aligned pairs: 2):
A\tc1\tA|g1\t100\t200\t1\tMATCHES\tB\tc9\tB|h1\t1000\t1100\t1\t1e-50\t3.0
A\tc1\tA|g2\t300\t250\t2\tMATCHES\tB\tc9\tB|h2\t1300\t1200\t2\t1e-50\t6.0
## alignment A;c1 vs. B;c9 (reverse) Alignment #1  score = 3.0 (num aligned pairs: 1) local inversion:
A\tc1\tA|g5\t900\t950\t5\tMATCHES\tB\tc9\tB|h5\t50\t10\t5\t1e-50\t3.0
## alignment A;c2 vs. B;c8 (reverse) Alignment #1  score = 3.0 (num aligned pairs: 1):
A\tc2\tA|g3\t10\t60\t1\tMATCHES\tB\tc8\tB|h3\t700\t650\t9\t1e-50\t3.0
";

    fn row(q: &str, s: &str, pident: f64, len: u64, bits: f64) -> String {
        format!("{q}\t{s}\t{pident}\t{len}\t0\t0\t1\t{len}\t1\t{len}\t1e-50\t{bits}\n")
    }

    #[test]
    fn parses_chains_like_the_spans_script() {
        let parsed = parse_aligncoords(ALIGNCOORDS.as_bytes()).unwrap();
        assert_eq!(parsed.pairs.len(), 4);
        assert_eq!(
            parsed.pairs[1],
            AlignedPair {
                genome_a: "A".into(),
                gene_a: "A|g2".into(),
                genome_b: "B".into(),
                gene_b: "B|h2".into(),
            }
        );

        assert_eq!(parsed.chains.len(), 3);
        assert_eq!(
            parsed.chains[0].span_key,
            "A;c1\t100-300\tB;c9\t1000-1300\t+\t2"
        );
        assert_eq!(parsed.chains[0].pair_indices, vec![0, 1]);
        assert!(parsed.chains[1].local_inversion);
        assert_eq!(
            parsed.chains[2].span_key,
            "A;c2\t10-60\tB;c8\t650-700\t-\t1"
        );
        assert_eq!(parsed.chains[2].pair_indices, vec![3]);
    }

    #[test]
    fn best_hit_is_highest_bitscore_in_either_direction() {
        let mut wanted: HitTable = HashMap::new();
        wanted
            .entry("A|g1".into())
            .or_default()
            .insert("B|h1".into(), None);

        let a_vs_b = row("A|g1", "B|h1", 90.0, 100, 150.0)
            + &row("A|g1", "B|zz", 99.0, 100, 900.0)   // not a wanted pair
            + "too\tfew\tcolumns\n"
            + &row("A|g1", "B|h1", f64::NAN, 100, 950.0)
            + &row("A|g1", "B|h1", 110.0, 100, 950.0)
            + &row("A|g1", "B|h1", 100.0, 0, 950.0)
            + &row("A|g1", "B|h1", 100.0, 100, f64::INFINITY);
        let b_vs_a = row("B|h1", "A|g1", 80.0, 300, 400.0)  // higher bitscore, other direction
            + &row("B|h1", "A|g1", 70.0, 400, 400.0); // tie on bitscore, longer alignment

        assert_eq!(
            scan_tabular_hits(a_vs_b.as_bytes(), &mut wanted).unwrap(),
            5
        );
        assert_eq!(
            scan_tabular_hits(b_vs_a.as_bytes(), &mut wanted).unwrap(),
            0
        );
        assert_eq!(
            wanted["A|g1"]["B|h1"],
            Some(BestHit {
                pident: 70.0,
                aln_len: 400,
                bitscore: 400.0
            })
        );
    }

    #[test]
    fn full_ties_do_not_depend_on_read_order() {
        let x = row("A|g1", "B|h1", 96.1, 300, 675.0);
        let y = row("B|h1", "A|g1", 98.8, 300, 675.0);
        for (first, second) in [(&x, &y), (&y, &x)] {
            let mut wanted: HitTable = HashMap::new();
            wanted
                .entry("A|g1".into())
                .or_default()
                .insert("B|h1".into(), None);
            scan_tabular_hits(first.as_bytes(), &mut wanted).unwrap();
            scan_tabular_hits(second.as_bytes(), &mut wanted).unwrap();
            assert_eq!(wanted["A|g1"]["B|h1"].unwrap().pident, 98.8);
        }
    }

    #[test]
    fn weights_block_identity_by_alignment_length() {
        let parsed = parse_aligncoords(ALIGNCOORDS.as_bytes()).unwrap();
        let hits = vec![
            Some(BestHit {
                pident: 90.0,
                aln_len: 100,
                bitscore: 1.0,
            }),
            Some(BestHit {
                pident: 100.0,
                aln_len: 300,
                bitscore: 1.0,
            }),
            Some(BestHit {
                pident: 10.0,
                aln_len: 999,
                bitscore: 1.0,
            }), // local inversion: ignored
            None,
        ];
        let by_key = chain_identities(&parsed.chains, &hits);

        // (90*100 + 100*300) / 400 = 97.5
        assert_eq!(
            by_key["A;c1\t100-300\tB;c9\t1000-1300\t+\t2"],
            [SpanIdentity(Some(97.5), 2, 2)]
        );
        assert_eq!(
            by_key["A;c2\t10-60\tB;c8\t650-700\t-\t1"],
            [SpanIdentity(None, 1, 0)]
        );
        assert_eq!(by_key.len(), 2);
    }

    #[test]
    fn span_lines_map_to_chains_and_skip_blank_lines() {
        let mut by_key = HashMap::new();
        let first = SpanIdentity(Some(97.5), 2, 2);
        let second = SpanIdentity(Some(88.0), 2, 2);
        by_key.insert(
            "A;c1\t100-300\tB;c9\t1000-1300\t+\t2".to_string(),
            vec![first, second],
        );
        let span = "A;c1\t100-300\t201\tB;c9\t1000-1300\t301\t+\t2\t0.67";
        let spans = format!("{span}\n\nX;c\t1-2\t2\tY;c\t1-2\t2\t+\t1\t1.00\n{span}\n");

        assert_eq!(
            span_identities(&spans, by_key),
            vec![Some(second), None, Some(first)]
        );
    }

    #[test]
    fn computes_from_files_and_serialises_compactly() {
        let dir = tempfile::tempdir().unwrap();
        let aligncoords = dir.path().join("x.aligncoords");
        fs::write(&aligncoords, ALIGNCOORDS).unwrap();
        let blast = dir.path().join("blast");
        fs::create_dir(&blast).unwrap();
        fs::write(
            blast.join("A_vs_B.out"),
            row("A|g1", "B|h1", 90.0, 100, 150.0) + &row("A|g2", "B|h2", 100.0, 300, 500.0),
        )
        .unwrap();
        // B_vs_A.out missing: the other direction is still used.

        let spans = "A;c1\t100-300\t201\tB;c9\t1000-1300\t301\t+\t2\t0.67\nA;c2\t10-60\t51\tB;c8\t650-700\t51\t-\t1\t1.00\n";
        let id =
            compute_synteny_identity(&aligncoords, spans, &blast, "pep", true, &Logger).unwrap();

        assert_eq!(
            serde_json::to_string(&id).unwrap(),
            r#"{"alignment_type":"pep","span_identity":[[97.5,2,2],[null,1,0]],"pair_identity":[90.0,100.0,null,null]}"#
        );

        let without_pairs =
            compute_synteny_identity(&aligncoords, spans, &blast, "pep", false, &Logger).unwrap();
        assert!(!serde_json::to_string(&without_pairs)
            .unwrap()
            .contains("pair_identity"));

        assert!(compute_synteny_identity(
            &aligncoords,
            spans,
            &dir.path().join("missing"),
            "pep",
            true,
            &Logger
        )
        .is_none());
    }
}
