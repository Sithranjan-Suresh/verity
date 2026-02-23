document.addEventListener("click", (e) => {
    const target = e.target;
    const link = target.closest("a");
    if (link && link.href) {
        console.log("Clicked URL:", link.href);
    }
});
