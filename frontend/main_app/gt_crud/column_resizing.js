// column_resizing.js

export function initialize_column_resizing(table_element) {
    // Haetaan kaikki otsikkosolut
    const table_headers = table_element.querySelectorAll("th");

    table_headers.forEach(function(th_element) {
        // Luodaan jokaiselle otsikkosolulle kahva, jos sitä ei ole jo lisätty
        let existing_resize_handle = th_element.querySelector(".resize-handle");
        if (!existing_resize_handle) {
            const resize_handle_element = document.createElement("div");
            resize_handle_element.classList.add("resize-handle");
            th_element.appendChild(resize_handle_element);
        }
    });

    // Lisätään mousedown-tapahtumat jokaiselle kahvalle
    const resize_handles = table_element.querySelectorAll(".resize-handle");
    resize_handles.forEach(function(resize_handle_element) {
        resize_handle_element.addEventListener("mousedown", function(mousedown_event) {
            mousedown_event.preventDefault();

            // Tallennetaan TH-elementti ja sen tämänhetkinen leveys
            let table_header_element = resize_handle_element.parentElement;
            let start_mouse_x_position = mousedown_event.pageX;
            let start_header_width = table_header_element.offsetWidth;

            // Huom! Handle-nappauksen kohta (hiiri vs. kahvan vasen reuna)
            // Tällöin sarake ei "hyppää", koska otetaan huomioon, 
            // ettet välttämättä klikkaa kahvan vasempaan reunaan täsmälleen.
            const handle_rect = resize_handle_element.getBoundingClientRect();
            const handle_grab_offset = mousedown_event.clientX - handle_rect.left;

            function handle_mousemove(mousemove_event) {
                // Lasketaan, kuinka paljon hiiri on siirtynyt vaakasuunnassa
                // ottaen huomioon "alkugrabin" offsetin
                let diff_x = (mousemove_event.clientX - handle_grab_offset) - start_mouse_x_position;
                let new_width = start_header_width + diff_x;

                // Estetään solun kaventuminen liikaa
                if (new_width > 30) {
                    table_header_element.style.width = new_width + "px";
                }
            }

            function handle_mouseup() {
                document.removeEventListener("mousemove", handle_mousemove);
                document.removeEventListener("mouseup", handle_mouseup);
            }

            document.addEventListener("mousemove", handle_mousemove);
            document.addEventListener("mouseup", handle_mouseup);
        });
    });
}