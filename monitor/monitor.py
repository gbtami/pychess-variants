from datetime import datetime
import os
import logging

import aiohttp

from textual.app import App, ComposeResult
from textual.css.query import NoMatches
from textual.widgets import (
    Header,
    Footer,
    DataTable,
    Label,
    Rule,
    Sparkline,
    Static,
    Switch,
    TabbedContent,
    TabPane,
)
from textual.containers import Vertical, Horizontal
from textual.reactive import reactive
from rich.text import Text


# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

PYCHESS_MONITOR_TOKEN = os.getenv("PYCHESS_MONITOR_TOKEN", "")
URL = "http://localhost:8080/metrics"


class MemoryMonitorApp(App):
    """Textual TUI app to monitor aiohttp server memory usage and object usage."""

    CSS = """
    Screen {
        layout: vertical;
    }

    .container {
        height: auto;
        width: auto;
    }

    Static {
        margin: 1;
    }

    Switch {
        height: auto;
        width: auto;
    }

    DataTable {
        height: 1fr;
        background: $panel;
        border: $secondary;
    }

    TabbedContent {
        height: 1fr;
        min-height: 10;
        background: $panel;
        border: $secondary;
    }

    Label {
        margin: 0 1;
        width: 100%;
    }

    .label {
        width: auto;
    }

    Sparkline {
        margin: 1;
        width: 100%;
    }

    Vertical {
        align: center middle;
    }

    #left_panel {
        width: 25%;
        background: $panel;
        border: $secondary;
        content-align: center middle;
    }

    #right_panel {
        width: 75%;
    }
    """

    monitoring = reactive(True)  # switch on/off

    categories = reactive([])

    column_configs = reactive({})

    category_counts = reactive({})
    category_memories = reactive({})
    category_histories = reactive({})

    top_allocations = reactive([])
    object_details = reactive({})

    sort_columns = reactive({})
    sort_ascendings = reactive({})

    def __init__(self):
        super().__init__()
        self.update_interval = 5
        self.max_history = 100
        self.ui_setup_done = False

    def compose(self) -> ComposeResult:
        """Compose the TUI layout."""
        yield Header()
        with Horizontal():
            with Vertical(id="left_panel"):
                yield Horizontal(
                    Static("Monitoring:", classes="label"),
                    Switch(value=True, id="monitoring"),
                    classes="container",
                )
                yield Rule()
            with Vertical(id="right_panel"):
                yield DataTable(id="alloc_table")
                yield TabbedContent(id="details_tabs")
        yield Footer()

    def watch_category_counts(self, value: dict) -> None:
        for cat, count in value.items():
            try:
                self.query_one(f"#{cat}_count_label").update(f"{cat.capitalize()}: {count}")
            except NoMatches:
                pass

    def watch_category_memories(self, value: dict) -> None:
        for cat, mem in value.items():
            try:
                self.query_one(f"#{cat}_mem_label").update(
                    f"{cat.capitalize()} Mem: [b]{mem:.2f} KB[/b]"
                )
            except NoMatches:
                pass

    def watch_category_histories(self, value: dict) -> None:
        for cat, hist in value.items():
            try:
                self.query_one(f"#{cat}_sparkline", Sparkline).data = hist
            except NoMatches:
                pass

    def watch_top_allocations(self, value: list) -> None:
        """Update allocation table when top_allocations changes."""
        alloc_table = self.query_one("#alloc_table", DataTable)
        alloc_table.clear()
        for alloc_type, count, size_bytes, size_human in value:
            alloc_table.add_row(alloc_type, str(count), str(size_bytes), size_human)

    def watch_object_details(self, value: dict) -> None:
        """Update all category tables when object_details changes."""
        for category in self.categories:
            self.update_category_table(category)

    def watch_sort_columns(self, value: dict) -> None:
        """Update tables when sort_columns changes."""
        for category in value:
            if value[category] is not None:
                self.update_category_table(category)

    def watch_sort_ascendings(self, value: dict) -> None:
        """Update tables when sort_ascendings changes."""
        for category in value:
            if self.sort_columns[category] is not None:
                self.update_category_table(category)

    async def on_mount(self) -> None:
        """Set up the app on startup."""
        self.query_one("#left_panel").border_title = "App State"
        self.query_one("#alloc_table").border_title = "Alloc Table"
        self.query_one("#details_tabs").border_title = "Object Details"

        # Configure the allocation table
        alloc_table = self.query_one("#alloc_table", DataTable)
        alloc_table.add_columns("Type", "Count", "Size (bytes)", "Size (human)")
        alloc_table.zebra_stripes = True

        # Start periodic updates
        self.set_interval(self.update_interval, self.update_metrics)

    async def setup_ui(self) -> None:
        if self.ui_setup_done:
            return
        left_panel = self.query_one("#left_panel")
        details_tabs = self.query_one("#details_tabs", TabbedContent)

        # First, create and mount all TabPane widgets
        for cat in self.categories:
            pane = TabPane(cat.capitalize(), id=f"{cat}_tab")
            await details_tabs.add_pane(pane)

        # Then, mount labels, sparklines, and tables
        for cat in self.categories:
            count_label = Label(id=f"{cat}_count_label")
            mem_label = Label(id=f"{cat}_mem_label")
            sparkline = Sparkline([], id=f"{cat}_sparkline")
            await left_panel.mount(count_label, mem_label, sparkline)

            table = DataTable(id=f"{cat}_table")
            await details_tabs.query_one(f"#{cat}_tab", TabPane).mount(table)

            config = self.column_configs.get(cat, [])
            if not config:  # Handle empty column_configs (e.g., for 'connections')
                table.add_column("No Data", key="no_data")
            else:
                for label, _ in config:
                    table.add_column(label, key=label)
            table.zebra_stripes = True
            table.cursor_type = "row"
            table.show_header = True
            table.show_cursor = True
            table.fixed_rows = 0

        self.ui_setup_done = True

    async def update_metrics(self) -> None:
        """Fetch server metrics and update reactive variables."""
        if not self.monitoring:
            return

        need_inspect = True
        async with aiohttp.ClientSession() as session:
            try:
                headers = {"Authorization": "Bearer %s" % PYCHESS_MONITOR_TOKEN}
                url = (URL + "?inspect=True") if need_inspect else URL
                async with session.get(url, headers=headers) as response:
                    if response.status == 200:
                        data = await response.json()
                        logger.info(f"Received metrics: {data}")

                        if not self.categories:
                            self.categories = list(data.get("object_details", {}).keys())
                            self.column_configs = {}
                            for cat in self.categories:
                                items = data["object_details"].get(cat, [])
                                if items:
                                    keys = sorted(items[0].keys())
                                    self.column_configs[cat] = [
                                        (k.replace("_", " ").title(), k) for k in keys
                                    ]
                                else:
                                    self.column_configs[cat] = []
                            self.sort_columns = {cat: None for cat in self.categories}
                            self.sort_ascendings = {cat: True for cat in self.categories}
                            self.category_histories = {cat: [] for cat in self.categories}
                            await self.setup_ui()
                            # Initialize counts and memories after UI setup
                            self.category_counts = {
                                cat: data.get("object_counts", {}).get(cat, 0)
                                for cat in self.categories
                            }
                            self.category_memories = {
                                cat: data.get("object_sizes", {}).get(cat, 0.0)
                                for cat in self.categories
                            }

                        else:
                            self.category_counts = {
                                cat: data.get("object_counts", {}).get(cat, 0)
                                for cat in self.categories
                            }
                            self.category_memories = {
                                cat: data.get("object_sizes", {}).get(cat, 0.0)
                                for cat in self.categories
                            }

                        histories = self.category_histories.copy()
                        for cat in self.categories:
                            histories[cat] = histories[cat] + [self.category_counts[cat]]
                            histories[cat] = histories[cat][-self.max_history :]
                        self.category_histories = histories

                        self.top_allocations = [
                            (
                                alloc["type"],
                                alloc["count"],
                                alloc["size_bytes"],
                                alloc["size_human"],
                            )
                            for alloc in data.get("top_allocations", [])
                        ]
                        self.object_details = data.get(
                            "object_details",
                            {cat: [] for cat in self.categories},
                        )

                    else:
                        if self.categories:
                            self.category_counts = {cat: -1 for cat in self.categories}
            except aiohttp.ClientError as e:
                logger.error(f"Failed to fetch metrics: {e}")
                if self.categories:
                    self.category_counts = {cat: -1 for cat in self.categories}

    def update_category_table(self, category: str) -> None:
        """Update the details table for a specific category."""
        try:
            table = self.query_one(f"#{category}_table", DataTable)
        except NoMatches:
            return
        table.clear()  # Clear existing rows

        columns = self.column_configs.get(category, [])
        base_labels = {lbl: lbl for lbl, _ in columns}

        sort_column = self.sort_columns.get(category)
        sort_ascending = self.sort_ascendings.get(category, True)

        # Update column labels with sort indicators
        for col in table.columns.values():
            base_label_str = col.label.plain.strip(" ↑↓")
            base_label = base_labels.get(base_label_str, base_label_str)
            label = base_label
            if base_label == sort_column:
                label += " ↑" if sort_ascending else " ↓"
            col.label = Text(label)

        # Pre-sort data
        items = self.object_details.get(category, [])

        if sort_column and columns:
            data_key = next((dk for lbl, dk in columns if lbl == sort_column), None)
            if data_key:

                def sort_key(item):
                    value = item.get(data_key, "")
                    if data_key == "online":
                        return 1 if value else 0
                    elif any(sub in data_key for sub in ["date", "time", "seen"]):
                        try:
                            return datetime.fromisoformat(value)
                        except Exception:
                            return datetime.min
                    elif isinstance(value, list):
                        return ", ".join(map(str, value))
                    return value or ""

                try:
                    items = sorted(items, key=sort_key, reverse=not sort_ascending)
                except Exception as e:
                    self.notify(f"Sort failed: {e}", title="Error", severity="error", timeout=3)

        # Format values and add rows
        def format_date(value):
            try:
                return datetime.fromisoformat(value).strftime("%m/%d/%Y %H:%M") if value else "-"
            except (ValueError, TypeError):
                return "-"

        for item in items:
            row = []
            for _, key in columns or [("No Data", "no_data")]:
                value = item.get(key, "-")
                if key == "online":
                    formatted = "🟢" if value else "⚪"
                elif any(sub in key for sub in ["date", "time", "seen", "expire_at"]):
                    formatted = format_date(value)
                elif isinstance(value, list):
                    formatted = ", ".join(map(str, value))
                else:
                    formatted = str(value)
                row.append(formatted)
            table.add_row(*row)

        table.refresh()

    def on_switch_changed(self, event: Switch.Changed) -> None:
        if event.switch.id == "monitoring":
            self.monitoring = event.switch.value

    def on_data_table_header_selected(self, event: DataTable.HeaderSelected) -> None:
        table_id = event.data_table.id
        if table_id.endswith("_table"):
            category = table_id[:-6]  # remove '_table'
            if category in self.sort_columns:
                column_key = event.column_key
                new_sort_columns = dict(self.sort_columns)
                new_sort_ascendings = dict(self.sort_ascendings)
                if new_sort_columns[category] == column_key:
                    new_sort_ascendings[category] = not new_sort_ascendings[category]
                else:
                    new_sort_columns[category] = column_key
                    new_sort_ascendings[category] = True
                self.sort_columns = new_sort_columns
                self.sort_ascendings = new_sort_ascendings


if __name__ == "__main__":
    app = MemoryMonitorApp()
    app.run()
