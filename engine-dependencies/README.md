# Locked engine dependency prefetch

These two manifests are copied byte-for-byte from the reviewed bundled engine.
They prepare its public, checksummed Cargo dependency cache before private code
runs. They are not engine source and are not meant to be built here:

```sh
cargo fetch --locked --manifest-path engine-dependencies/Cargo.toml
```

The actual native support source is emitted by the selected engine and compiled
with `--locked --offline`. SOURCE.json records the manifests' hashes. Refresh them
only through scripts/sync-engine.py when deliberately updating the bundled engine.
