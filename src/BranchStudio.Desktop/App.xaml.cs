namespace BranchStudio.Desktop;

public partial class App : Application
{
    private readonly MainPage mainPage;

    public App(MainPage mainPage)
    {
        InitializeComponent();
        this.mainPage = mainPage;
        UserAppTheme = AppTheme.Dark;
    }

    protected override Window CreateWindow(IActivationState? activationState) => new(mainPage)
    {
        Title = "Branch Studio",
        Width = 1500,
        Height = 1000,
        MinimumWidth = 800,
        MinimumHeight = 600,
    };
}
