document.getElementById('imageFile').addEventListener('click', function () {
  let selectedFile = document.getElementById('imagedFile').files[0];
  let fileReader = new FileReader();

  fileReader.onloadend = function () {
    let arrayBuffer = fileReader.result;
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      chrome.tabs.sendMessage(tabs[0].id, { buffer: arrayBuffer, fileName: selectedFile.name });
    });
  };
  fileReader.readAsArrayBuffer(selectedFile);
});

document.getElementById("uploadForm").addEventListener("submit", async function (e) {
  e.preventDefault();
  const file = document.getElementById("imageFile").files[0];
  const email = document.getElementById("email").value;
  console.log(JSON.stringify({ filename: file.name }));

  fetch("https://api.ldar.p6m7g8.net/presign", {
    method: "POST",
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ filename: file.name })
  })
  .then(response => response.json())
  .then(data => {
    const url = data.url;
    fetch(url, {
      method: "PUT",
      body: file
    })
    .then(() => {
      fetch("https://api.ldar.p6m7g8.net/brand", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ image: file.name, email: email })
      })
      .then(response => response.text())  // parse response as text
      .then(html => {
        document.body.innerHTML = html;
      });
    });
  })
  .catch(error => {
    console.error('There has been a problem with your fetch operation:', error);
  });
});
