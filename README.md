Operating system: Windows

File system: NTFS

```
Usage:
	cscript sparser.js torrent <sparse_length> <torrent_path> <torrent_file>
	cscript sparser.js (ed2k|ipfs|tth) <sparse_length> <file_path>
	cscript sparser.js <block_size> <sparse_length> <file_path>
```

1. Instead of deleting download, sparse it to free some space(<sparse_length>)
2. Stop files download.
3. Recheck download.
4. Continue seeding.