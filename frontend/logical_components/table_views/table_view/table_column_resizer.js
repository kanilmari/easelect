// table_column_resizer.js
// Resize columns of the table
document.addEventListener("DOMContentLoaded", function () {
    const table_headers = document.querySelectorAll("#auth_user_groups_table th");
    table_headers.forEach(function (table_header) {
        let existing_resize_handle = table_header.querySelector(".resize-handle");
        if (!existing_resize_handle) {
            let resize_handle_element = document.createElement("div");
            resize_handle_element.classList.add("resize-handle");
            table_header.appendChild(resize_handle_element);
        }
    });

    const resize_handles = document.querySelectorAll(".resize-handle");
    resize_handles.forEach(function (resize_handle_element) {
        resize_handle_element.addEventListener("mousedown", function (mousedown_event) {
            mousedown_event.preventDefault();
            let table_header_element = resize_handle_element.parentElement;
            let start_mouse_x_position = mousedown_event.pageX;
            let start_header_width = table_header_element.offsetWidth;

            function handle_mousemove(mousemove_event) {
                let offset_x = mousemove_event.pageX - start_mouse_x_position;
                let new_width = start_header_width + offset_x;
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
});
