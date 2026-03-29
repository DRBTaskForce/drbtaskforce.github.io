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
