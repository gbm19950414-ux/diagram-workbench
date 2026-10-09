workspace "Reading List" "Independent fictional consumer" {
    model {
        reader = person "Reader"
        catalog = softwareSystem "Catalog" "Returns saved book titles"
        reader -> catalog "Requests saved titles"
    }
    views {
        systemContext catalog "Context" {
            include *
            autolayout lr
        }
    }
}
