
const currentLanguage = document.getElementById('selected-language').dataset.language;

const languageFilter = document.getElementById('tsd-language-filter');
languageFilter.addEventListener("mouseenter", (event) => {
    languageFilter.classList.add("active");
    const languageList = document.getElementById('tsd-language-select-list');
    const items = languageList.getElementsByTagName('li');
    for (const item of items) {
        if (item.dataset.value === currentLanguage) {
            item.classList.add('selected');
            break;
        }
    }
});
languageFilter.addEventListener("mouseleave", (event) => {
    languageFilter.classList.remove("active");
});

function addEventListenerToLanguages() {
    const languageList = document.getElementById('tsd-language-select-list');
    const items = languageList.getElementsByTagName('li');
    for (const item of items) {
        item.addEventListener("click", (event) => {
            languageSelected(event, item);
        });
    }
}

function languageSelected(event, itemClicked) {
    const selectedLanguage = itemClicked.dataset.value; //'en', 'fr', 'es', '..'
    if (currentLanguage === selectedLanguage) return;
    document.location = document.location.href.replace(`/${currentLanguage}/`, `/${selectedLanguage}/`);
}
function replaceMainBreadcrumbLink() {
    const mainBreadcrumb = document.querySelector('.main-breadcrumb');
    console.log(mainBreadcrumb);
    console.log(mainBreadcrumb.href);
    if (!mainBreadcrumb.href.indexOf("modules.html")) return;
    mainBreadcrumb.href = mainBreadcrumb.href.replace(`/modules.html`,`/index.html`);
}

function initializePage() {
    addEventListenerToLanguages();
    replaceMainBreadcrumbLink();
}
initializePage();