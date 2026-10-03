"""Build a standalone HTML document from the supplied source files."""
from pathlib import Path
import base64

root = Path(__file__).resolve().parent
css = (root / "styles.css").read_text(encoding="utf-8")
for name in ("background-cover.webp",):
    data = (root / "assets" / name).read_bytes()
    css = css.replace("assets/" + name, "data:image/webp;base64," + base64.b64encode(data).decode("ascii"))
shell = (root / "shell.html").read_text(encoding="utf-8")
js = (root / "script.js").read_text(encoding="utf-8")
if "</script" in js.lower():
    raise ValueError("Unexpected HTML script terminator in script.js")
result = shell.replace("__STYLES__", "<style>\n" + css + "\n</style>").replace("__SCRIPT__", "<script>\n" + js + "\n</script>")
(root / "index.html").write_text(result, encoding="utf-8")
print("Built index.html:", len(result.encode("utf-8")), "bytes")
