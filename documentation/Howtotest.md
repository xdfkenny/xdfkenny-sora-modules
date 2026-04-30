# How to test?

There are a couple ways to test your module:

## In Browser

Huge thanks to [@JMcrafter26](https://github.com/jmcrafter26) for making this website, it simulates Sora's frontend, a great way to quickly test your modules on PC in case you don't own a Mac.

The website and FAQ can be found here: [Sora Web-UI](https://sora.jm26.net/web-ui/)

## With Sora on Mac

Get the Sora app for Mac from [here](https://github.com/cranci1/Sora/releases/).
Or clone the code and start it from XCode to have the latest update.

This is the fastest way to test it in the app, seeing as Github raw often takes some time to update it's faster to directly edit the Sora cached modules.

To add the module to the app, host your java script file and JSON on your preferred file hoster (needs to support viewing the raw file), it is recommended to use GitHub. Also [npoint.io](http://npoint.io/) is great for paste bin json files.

Once you've hosted the file, you will need to copy the raw link of the java script file and add it to your JSON, after doing this you will need to copy the raw link of your JSON, which will look something like this:

```text
https://raw.githubusercontent.com/50n50/maisgay/refs/heads/main/hianime/hianime.json
```

To find the cached scripts, head over to this file path on your Mac:

```
/Users/[Your username]/Library/Containers/me.cranci.sulfur/Data/Documents/
```

Note: If you used XCode and build the code yourself, then use the your choosen Bundle Identifier instead of "me.cranci.sulfur"

You will find all the modules there, unfortunately they will have some gibberish name so you will need to which is the one you want to edit. Once you've found it you can easily edit anything you want and restart the Sora app to quickly test the changes.

### Live logs (MacOS)
#### Terminal
To have live logs, use the following command in your MacOS terminal:

```
tail -f [PATH TO LOG.TXT FILE IN THE SULFUR DOCUMENTS FOLDER]
```

For example:

```
tail -f /Users/paul/Library/Containers/me.cranci.sulfur/Data/Documents/logs.txt
```

This will enable you to have logs open simultaneously whilst testing in the app. 

#### XCode
The latest Sora/Sulfur build should route logs to the XCode console allowing you to test and monitor the logs simultaneously.

## With Sora on a IDevice

To test in Sora, you will obviously need to first sideload the app, join the official discord for help if needed!

To add the module to the app, host your java script file and JSON on your preferred file hoster (needs to support viewing the raw file), it is recommended to use GitHub.

Once you've hosted the file, you will need to copy the raw link of the java script file and add it to your JSON, after doing this you will need to copy the raw link of your JSON, which will look something like this:

```text
https://raw.githubusercontent.com/50n50/maisgay/refs/heads/main/hianime/hianime.json
```

Please make sure you are copying the raw link!

After making modifications, remove the module from Sora and restart to app before re-adding it!