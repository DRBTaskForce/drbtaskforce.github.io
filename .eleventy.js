module.exports = function(eleventyConfig) {
  // Copy static assets
  eleventyConfig.addPassthroughCopy("src/assets");
  
  // Copy CNAME for GitHub Pages
  eleventyConfig.addPassthroughCopy("src/CNAME");
  
  // Copy other root files if they exist
  eleventyConfig.addPassthroughCopy("src/robots.txt");
  eleventyConfig.addPassthroughCopy("src/favicon.ico");
  
  // Watch Tailwind source only — main.css is generated output, watching it causes an infinite loop
  eleventyConfig.addWatchTarget("src/assets/css/tailwind.css");

  // Format a large DRB float string (e.g. "4321370731.97") as "4.32B"
  eleventyConfig.addFilter("formatDrb", (value) => {
    const n = parseFloat(value);
    if (n >= 1e9) return (n / 1e9).toFixed(2) + "B";
    if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
    if (n >= 1e3) return (n / 1e3).toFixed(2) + "K";
    return n.toFixed(2);
  });

  // Format a WETH float string (e.g. "140.362") as "140.36"
  eleventyConfig.addFilter("formatWeth", (value) => {
    return parseFloat(value).toFixed(3);
  });

  // Format an ISO date string as "Apr 2, 2026"
  eleventyConfig.addFilter("formatDate", (value) => {
    return new Date(value).toLocaleDateString("en-US", {
      month: "short", day: "numeric", year: "numeric", timeZone: "UTC"
    });
  });
  
  // Set directories
  return {
    dir: {
      input: "src",
      includes: "_includes",
      data: "_data",
      output: "_site"
    },
    templateFormats: ["njk", "md", "html"],
    htmlTemplateEngine: "njk",
    markdownTemplateEngine: "njk"
  };
};
