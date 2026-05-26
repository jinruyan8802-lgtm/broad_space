const http = require("http");
const PORT = process.env.PORT || 3000;
const API = process.env.API_URL || "http://localhost:8000";

const FEED_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>BroadSpace Feed</title>
<style>
  body { font-family: system-ui, sans-serif; max-width: 800px; margin: 40px auto; padding: 0 20px; background: #f9fafb; }
  h1 { color: #111; border-bottom: 2px solid #3b82f6; padding-bottom: 10px; }
  .card { background: white; border-radius: 8px; padding: 16px; margin: 16px 0; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
  .card h2 { margin: 0 0 8px; font-size: 18px; }
  .card h2 a { color: #111; text-decoration: none; }
  .card h2 a:hover { color: #3b82f6; }
  .meta { font-size: 12px; color: #666; margin-bottom: 8px; }
  .summary { color: #374151; font-size: 14px; line-height: 1.5; }
  .signal-high { background: #fef2f2; color: #dc2626; font-weight: 700; }
  .signal-mid { background: #fefce8; color: #ca8a04; font-weight: 700; }
  .signal-low { background: #eff6ff; color: #2563eb; font-weight: 700; }
  .cat { background: #f3f4f6; color: #374151; padding: 2px 6px; border-radius: 4px; font-size: 11px; margin-right: 4px; }
  .signal { float: right; }
  .nav { margin-bottom: 20px; }
  .nav a { color: #3b82f6; text-decoration: none; margin-right: 16px; font-weight: 600; }
  .nav a:hover { text-decoration: underline; }
  .nav a.active { color: #111; text-decoration: none; cursor: default; }
</style>
</head>
<body>
<h1>BroadSpace Feed</h1>
<div class="nav">
  <a href="/" class="active">Feed</a>
  <a href="/graph">Knowledge Graph</a>
</div>
<div id="status" style="color:#666;font-style:italic">Loading...</div>
<div id="content"></div>
<script>
var API = "${API}";
function escapeHtml(t) {
  if (!t) return "";
  return t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
async function load() {
  try {
    var resp = await fetch(API + "/content?limit=50");
    if (!resp.ok) throw new Error("API error: " + resp.status);
    var data = await resp.json();
    var el = document.getElementById("status");
    el.textContent = data.length + " items";
    el.style = "";
    var c = document.getElementById("content");
    if (data.length === 0) {
      c.innerHTML = "<p>No content yet. Run the pipeline to populate.</p>";
      return;
    }
    c.innerHTML = data.map(function(i) {
      var sc = i.signal_strength >= 0.7 ? "high" : i.signal_strength >= 0.5 ? "mid" : "low";
      var cats = (i.categories || []).map(function(c) { return '<span class="cat">' + escapeHtml(c) + '</span>'; }).join("");
      var sources = (i.sources || []).map(function(s) { return s.name; }).join(", ");
      return '<div class="card">'
        + '<span class="signal"><span class="signal-' + sc + '">' + (i.signal_strength || 0).toFixed(2) + '</span></span>'
        + '<h2><a href="' + escapeHtml(i.url) + '" target="_blank" rel="noopener">' + escapeHtml(i.title) + '</a></h2>'
        + '<div class="meta">' + escapeHtml(sources) + ' | ' + escapeHtml(i.sentiment || "") + '</div>'
        + '<div>' + cats + '</div>'
        + '<div class="summary">' + escapeHtml(i.summary || "") + '</div>'
        + '</div>';
    }).join("");
  } catch(e) {
    document.getElementById("status").innerHTML = '<div style="background:#fef2f2;color:#dc2626;padding:12px;border-radius:8px">Error: ' + escapeHtml(e.message) + '</div>';
  }
}
load();
setInterval(load, 60000);
</script>
</body>
</html>`;

const GRAPH_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>BroadSpace Knowledge Graph</title>
<style>
  body { font-family: system-ui, sans-serif; margin: 0; padding: 0; background: #f9fafb; overflow: hidden; }
  .nav { position: fixed; top: 20px; left: 20px; z-index: 10; }
  .nav a { color: #3b82f6; text-decoration: none; margin-right: 16px; font-weight: 600; background: white; padding: 8px 16px; border-radius: 6px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
  .nav a:hover { text-decoration: underline; }
  .nav a.active { color: #111; cursor: default; }
  #status { position: fixed; top: 60px; left: 20px; z-index: 10; font-size: 12px; color: #666; }
  svg { width: 100vw; height: 100vh; }
  .node circle { stroke: #fff; stroke-width: 2px; cursor: pointer; }
  .node text { font-size: 10px; pointer-events: none; }
  .link { stroke: #999; stroke-opacity: 0.3; }
  .tooltip { position: fixed; background: white; border: 1px solid #ddd; border-radius: 6px; padding: 10px 14px; font-size: 13px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); pointer-events: none; max-width: 300px; display: none; z-index: 100; }
</style>
</head>
<body>
<div class="nav">
  <a href="/">Feed</a>
  <a href="/graph" class="active">Knowledge Graph</a>
</div>
<div id="status">Loading...</div>
<div class="tooltip" id="tooltip"></div>
<svg id="graph"></svg>
<script src="https://d3js.org/d3.v7.min.js"></script>
<script>
var API = "${API}";
var colors = { Technology: "#ef4444", Concept: "#3b82f6", Organization: "#10b981", Person: "#8b5cf6", Event: "#f59e0b", Other: "#6b7280" };

async function load() {
  try {
    var resp = await fetch(API + "/graph/search?query=" + encodeURIComponent("AI") + "&limit=50");
    if (!resp.ok) throw new Error("API error: " + resp.status);
    var data = await resp.json();

    if (!data.results || data.results.length === 0) {
      document.getElementById("status").textContent = "No graph data yet. Process some articles first.";
      return;
    }

    var nodes_map = {};
    var links = [];

    data.results.forEach(function(r) {
      var words = r.text.split(/[\s,.()]+/).filter(function(w) {
        return w.length > 3 && w.match(/^[A-Z][a-z]/) && !["The","This","That","From","With"].includes(w);
      });

      var centerId = "result_" + Math.random().toString(36).substr(2, 6);
      nodes_map[centerId] = {
        id: centerId,
        title: r.text.substring(0, 50),
        group: "Concept",
        signal: r.score || 0,
        summary: r.text
      };

      words.slice(0, 5).forEach(function(word) {
        if (!nodes_map[word]) {
          nodes_map[word] = { id: word, title: word, group: "Technology", signal: 0.5, summary: "" };
        }
        links.push({ source: centerId, target: word, value: 1 });
      });
    });

    var nodes = Object.values(nodes_map);
    links = links.slice(0, Math.min(links.length, nodes.length * 3));

    render(nodes, links);
    document.getElementById("status").textContent = nodes.length + " articles, " + links.length + " connections";
  } catch(e) {
    document.getElementById("status").textContent = "Error: " + e.message;
  }
}

function render(nodes, links) {
  var svg = d3.select("#graph");
  svg.selectAll("*").remove();
  var width = window.innerWidth, height = window.innerHeight;

  var simulation = d3.forceSimulation(nodes)
    .force("link", d3.forceLink(links).id(function(d) { return d.id; }).distance(80))
    .force("charge", d3.forceManyBody().strength(-200))
    .force("center", d3.forceCenter(width / 2, height / 2))
    .force("collision", d3.forceCollide(20));

  var link = svg.append("g").selectAll("line")
    .data(links).join("line")
    .attr("class", "link")
    .attr("stroke-width", function(d) { return Math.sqrt(d.value); });

  var node = svg.append("g").selectAll("g")
    .data(nodes).join("g")
    .attr("class", "node")
    .call(d3.drag()
      .on("start", function(e, d) { if (!e.active) simulation.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
      .on("drag", function(e, d) { d.fx = e.x; d.fy = e.y; })
      .on("end", function(e, d) { if (!e.active) simulation.alphaTarget(0); d.fx = null; d.fy = null; }));

  node.append("circle")
    .attr("r", function(d) { return 5 + d.signal * 8; })
    .attr("fill", function(d) { return colors[d.group] || colors.Other; });

  node.append("text")
    .text(function(d) { return d.title.substring(0, 25); })
    .attr("x", 10).attr("y", 3);

  node.on("mouseover", function(e, d) {
    var tooltip = document.getElementById("tooltip");
    tooltip.style.display = "block";
    tooltip.innerHTML = "<strong>" + d.title + "</strong><br><span style='color:#666'>" + d.group + " | signal: " + d.signal.toFixed(2) + "</span>";
  }).on("mousemove", function(e) {
    var tooltip = document.getElementById("tooltip");
    tooltip.style.left = (e.pageX + 12) + "px";
    tooltip.style.top = (e.pageY - 10) + "px";
  }).on("mouseout", function() {
    document.getElementById("tooltip").style.display = "none";
  });

  simulation.on("tick", function() {
    link.attr("x1", function(d) { return d.source.x; })
        .attr("y1", function(d) { return d.source.y; })
        .attr("x2", function(d) { return d.target.x; })
        .attr("y2", function(d) { return d.target.y; });
    node.attr("transform", function(d) { return "translate(" + d.x + "," + d.y + ")"; });
  });

  window.addEventListener("resize", function() {
    width = window.innerWidth; height = window.innerHeight;
    simulation.force("center", d3.forceCenter(width / 2, height / 2));
    simulation.alpha(0.3).restart();
  });
}

load();
</script>
</body>
</html>`;

http.createServer(function(req, res) {
  var html = req.url === "/graph" ? GRAPH_HTML : FEED_HTML;
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(html);
}).listen(PORT, function() {
  console.log("Feed server listening on port " + PORT + ", API: " + API);
});
