    document.addEventListener('DOMContentLoaded', function() {
      var hash = window.location.hash.substring(1);
      var detailsElements = document.querySelectorAll('details');
      
      detailsElements.forEach(function(detailsElement, index) {
        if (index + 1 === parseInt(hash)) {
          detailsElement.open = true;
          detailsElement.scrollIntoView();
        }
      });
    });
